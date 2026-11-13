// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { AppointmentsPage } from "../../client/features/appointments";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Patient fixture",
  fileNumber: "17",
  archived: false,
  phone: "+22262112233",
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Doctor fixture",
  eligible: true,
};
const initial = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  startsAt: "2090-01-01T10:00:00.000Z",
  endsAt: "2090-01-01T10:30:00.000Z",
  status: "booked",
  editVersion: 1,
  administrativeNote: "Original",
  createdAt: "2090-01-01T09:00:00.000Z",
  createdBy: doctor,
  changes: [],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function transport(outcome: "success" | "conflict" | "uncertain" = "success") {
  let data = structuredClone(initial),
    writes = 0;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      writes++;
      const input = JSON.parse(String(options.body));
      if (outcome === "conflict" && writes === 1) {
        data.editVersion = 2;
        data.administrativeNote = "Colleague note";
        return new Response(JSON.stringify({ error: "edit_conflict" }), {
          status: 409,
        });
      }
      if (input.kind === "note")
        data.administrativeNote = input.administrativeNote.trim() || null;
      if (input.kind === "status") data.status = input.status;
      data.editVersion++;
      const receipt = {
        id: data.id,
        patientId: patient.id,
        doctorId: doctor.id,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        status: data.status,
        editVersion: data.editVersion,
        administrativeNote: data.administrativeNote,
      };
      if (outcome === "uncertain" && writes === 1)
        throw new TypeError("Response lost after commit");
      return new Response(JSON.stringify(receipt));
    }
    if (url.endsWith("/doctors"))
      return new Response(JSON.stringify({ items: [doctor] }));
    if (url.endsWith(data.id)) return new Response(JSON.stringify(data));
    return new Response(
      JSON.stringify({ items: [data], page: 1, total: 1, hasNext: false }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function open(lang: "ar" | "fr") {
  const t = translations[lang].appointments,
    user = userEvent.setup();
  const rendered = renderPatient(
    <AppointmentsPage lang={lang} canRead canWrite onExpired={vi.fn()} />,
  );
  await user.click(
    await screen.findByRole("button", {
      name: `${t.details}: ${patient.name} 10:00`,
    }),
  );
  await user.click(await screen.findByRole("button", { name: t.editNote }));
  return { ...rendered, user, t };
}
it.each(["ar", "fr"] as const)(
  "keeps a conflicting draft until explicit review and acknowledgement in %s",
  async (lang) => {
    const fetcher = transport("conflict"),
      { user, t } = await open(lang);
    fireEvent.change(screen.getByLabelText(t.note), {
      target: { value: "My draft" },
    });
    await user.click(screen.getByRole("button", { name: t.saveChanges }));
    await screen.findByText(t.editConflict);
    expect((screen.getByLabelText(t.note) as HTMLTextAreaElement).value).toBe(
      "My draft",
    );
    expect(
      screen
        .getByRole("button", { name: t.saveChanges })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: t.review }));
    await screen.findByText("Colleague note");
    await user.click(screen.getByRole("button", { name: t.keepDraft }));
    await user.click(screen.getByRole("button", { name: t.saveChanges }));
    await screen.findByText(t.updated);
    const writes = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "PATCH",
    );
    expect(writes).toHaveLength(2);
    expect(JSON.parse(String(writes[1][1]?.body))).toEqual({
      kind: "note",
      editVersion: 2,
      administrativeNote: "My draft",
    });
  },
);
it("does not resend a write after its response is lost and permits manual comparison", async () => {
  const fetcher = transport("uncertain"),
    { user, t } = await open("fr");
  fireEvent.change(screen.getByLabelText(t.note), {
    target: { value: "Potentially saved" },
  });
  await user.click(screen.getByRole("button", { name: t.saveChanges }));
  await screen.findByText(t.editUncertain);
  await user.click(screen.getByRole("button", { name: t.review }));
  await screen.findByText("Potentially saved", { selector: "dd" });
  await user.click(screen.getByRole("button", { name: t.useLatest }));
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: t.cancelEditing }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("requires confirmation for cancellation and sends only status and its optional reason", async () => {
  const fetcher = transport(),
    t = translations.fr.appointments,
    user = userEvent.setup();
  renderPatient(
    <AppointmentsPage lang="fr" canRead canWrite onExpired={vi.fn()} />,
  );
  await user.click(
    await screen.findByRole("button", {
      name: `${t.details}: ${patient.name} 10:00`,
    }),
  );
  await user.click(await screen.findByRole("button", { name: t.changeStatus }));
  const editor = screen
    .getByRole("heading", { name: t.changeStatus })
    .closest("section")!;
  const select = editor.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  select.focus();
  await user.keyboard("{Enter}{End}{Enter}");
  fireEvent.change(screen.getByLabelText(t.cancellationReason), {
    target: { value: "Patient called" },
  });
  await user.click(screen.getByRole("button", { name: t.saveChanges }));
  await screen.findByRole("alertdialog");
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: t.confirmCancellation }));
  await screen.findByText(t.updated);
  expect(
    JSON.parse(
      String(
        fetcher.mock.calls.find(
          ([, options]) => options?.method === "PATCH",
        )?.[1]?.body,
      ),
    ),
  ).toEqual({
    kind: "status",
    editVersion: 1,
    status: "cancelled",
    cancellationReason: "Patient called",
  });
});
it("preserves unsaved inputs and blocks saving when read permission is revoked", async () => {
  transport();
  const { rerender, user, t } = await open("fr");
  fireEvent.change(screen.getByLabelText(t.note), {
    target: { value: "Keep on revocation" },
  });
  rerender(
    <AppointmentsPage lang="fr" canRead={false} canWrite onExpired={vi.fn()} />,
  );
  expect((screen.getByLabelText(t.note) as HTMLTextAreaElement).value).toBe(
    "Keep on revocation",
  );
  expect(
    screen
      .getByRole("button", { name: t.saveChanges })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: t.close }));
  await screen.findByRole("alertdialog");
  await user.click(screen.getByRole("button", { name: t.stay }));
  expect((screen.getByLabelText(t.note) as HTMLTextAreaElement).value).toBe(
    "Keep on revocation",
  );
});

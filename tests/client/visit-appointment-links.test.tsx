// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, it, expect, vi } from "vitest";
import { act, cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientVisits } from "../../client/features/visits";
import { translations } from "../../client/shared/i18n";

const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Link patient",
  fileNumber: "9",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Visit doctor",
  eligible: true,
};
const appointmentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const row = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  status: "completed",
  arrivedAt: "2026-11-13T09:00:00.000Z",
  recordedEndAt: "2026-11-13T11:00:00.000Z",
  editVersion: 3,
  visit: {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    startedAt: "2026-11-13T10:00:00.000Z",
    recordedEndAt: "2026-11-13T11:00:00.000Z",
    editVersion: 2,
    status: "completed",
    appointmentLink: {
      visitId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: null as string | null,
      editVersion: 0,
    },
  },
};
const copy = {
  ar: {
    open: "ربط الموعد",
    save: "حفظ الرابط",
    choice: "الموعد المرجعي",
    warning:
      "فك الرابط لا يسمح بنقل الموعد إلى يوم آخر أو استعماله لزيارة أخرى.",
    mismatch: "طبيب الموعد مختلف عن طبيب الزيارة.",
  },
  fr: {
    open: "Lier un rendez-vous",
    save: "Enregistrer le lien",
    choice: "Rendez-vous de référence",
    warning:
      "Délier ne permet pas de déplacer ce rendez-vous vers un autre jour ni de le réutiliser pour une autre visite.",
    mismatch: "Le praticien du rendez-vous diffère de celui de la visite.",
  },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("shows the linked appointment's practitioner and state in confirmed history", async () => {
  const linked = {
    ...row,
    visit: {
      ...row.visit,
      appointmentLink: {
        ...row.visit.appointmentLink,
        appointmentId,
        editVersion: 1,
        appointment: {
          id: appointmentId,
          patientId: patient.id,
          doctorId: doctor.id,
          doctor: { id: doctor.id, name: "Linked practitioner" },
          startsAt: "2026-11-13T08:00:00.000Z",
          status: "cancelled",
          editVersion: 1,
        },
      },
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items: [linked], page: 1, hasNext: false }),
          { status: 200 },
        ),
    ),
  );
  renderPatient(
    <PatientVisits patient={patient} lang="fr" canRead onExpired={() => {}} />,
  );
  expect(await screen.findByText(/Linked practitioner/)).toBeTruthy();
});
it.each(["ar", "fr"] as const)(
  "links a completed visit with doctor and history consequences visible before saving in %s",
  async (lang) => {
    const t = copy[lang];
    const fetcher = vi.fn(
      async (url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method === "PATCH"
              ? {
                  ...row,
                  visit: {
                    ...row.visit,
                    editVersion: 3,
                    appointmentLink: {
                      ...row.visit.appointmentLink,
                      appointmentId,
                      editVersion: 1,
                    },
                  },
                }
              : url.endsWith("appointment-options")
                ? {
                    visitId: row.visit.id,
                    visitDay: "2026-11-13",
                    visitVersion: 2,
                    link: row.visit.appointmentLink,
                    items: [
                      {
                        id: appointmentId,
                        patientId: patient.id,
                        doctorId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                        doctor: {
                          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                          name: "Other practitioner",
                        },
                        startsAt: "2026-11-13T08:00:00.000Z",
                        status: "cancelled",
                        editVersion: 1,
                      },
                    ],
                  }
                : { items: [row], page: 1, hasNext: false },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.open }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t.warning)).toBeTruthy();
    (await within(dialog).findByRole("combobox", { name: t.choice })).focus();
    await user.keyboard(" ");
    await user.click(
      await screen.findByRole("option", { name: /Other practitioner/ }),
    );
    expect(within(dialog).getByText(t.mismatch)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    await screen.findByRole("status");
    const writes = fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1]!.body as string)).toEqual({
      kind: "assign",
      visitId: row.visit.id,
      visitVersion: 2,
      expectedLinkVersion: 0,
      appointmentId,
      expectedAppointmentVersion: 1,
    });
  },
);
it.each(["ar", "fr"] as const)(
  "keeps an uncertain link draft, requires explicit read and never repeats the write in %s",
  async (lang) => {
    const t = copy[lang],
      dt = translations[lang].editing;
    let stored = row;
    const option = {
      id: appointmentId,
      patientId: patient.id,
      doctorId: doctor.id,
      doctor: { id: doctor.id, name: doctor.name },
      startsAt: "2026-11-13T08:00:00.000Z",
      status: "cancelled",
      editVersion: 1,
    };
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        stored = {
          ...row,
          visit: {
            ...row.visit,
            editVersion: 3,
            appointmentLink: {
              ...row.visit.appointmentLink,
              appointmentId,
              editVersion: 1,
            },
          },
        };
        throw new TypeError("synthetic lost response after commit");
      }
      return new Response(
        JSON.stringify(
          url.endsWith("appointment-options")
            ? {
                visitId: row.visit.id,
                visitDay: "2026-11-13",
                visitVersion: 2,
                link: stored.visit.appointmentLink,
                items: [option],
              }
            : url.includes("/patient/")
              ? { items: [stored], page: 1, hasNext: false }
              : stored,
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.open }));
    const dialog = await screen.findByRole("dialog");
    (await within(dialog).findByRole("combobox", { name: t.choice })).focus();
    await user.keyboard("{Enter}{End}{Enter}");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    await within(dialog).findByText(dt.uncertain);
    expect(
      within(dialog)
        .getByRole("button", { name: t.save })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: dt.review }));
    await user.click(
      await within(dialog).findByRole("button", { name: dt.useLatest }),
    );
    expect(
      within(dialog)
        .getByRole("button", { name: t.save })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
    ).toHaveLength(1);
  },
);
it("guards a dirty link draft when Escape closes the Radix dialog", async () => {
  const t = copy.fr,
    dt = translations.fr.editing;
  const option = {
    id: appointmentId,
    patientId: patient.id,
    doctorId: doctor.id,
    doctor: { id: doctor.id, name: doctor.name },
    startsAt: "2026-11-13T08:00:00.000Z",
    status: "cancelled",
    editVersion: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("appointment-options")
              ? {
                  visitId: row.visit.id,
                  visitDay: "2026-11-13",
                  visitVersion: 2,
                  link: row.visit.appointmentLink,
                  items: [option],
                }
              : { items: [row], page: 1, hasNext: false },
          ),
          { status: 200 },
        ),
    ),
  );
  renderPatient(
    <PatientVisits patient={patient} lang="fr" canRead onExpired={() => {}} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: t.open }));
  (await screen.findByRole("combobox", { name: t.choice })).focus();
  await user.keyboard("{Enter}{End}{Enter}{Escape}");
  const guard = await screen.findByRole("alertdialog", {
    name: dt.discardTitle,
  });
  await user.click(within(guard).getByRole("button", { name: dt.stay }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it.each(["revised", "removed", "visit revised"] as const)(
  "preserves the chosen draft but warns and blocks when its displayed appointment is %s",
  async (change) => {
    const t = copy.fr,
      dt = translations.fr.editing;
    let revision = 1,
      visitVersion = 2,
      removed = false;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("appointment-options")
              ? {
                  visitId: row.visit.id,
                  visitVersion,
                  visitDay: "2026-11-13",
                  link: row.visit.appointmentLink,
                  items: removed
                    ? []
                    : [
                        {
                          id: appointmentId,
                          patientId: patient.id,
                          doctorId: doctor.id,
                          doctor: { id: doctor.id, name: doctor.name },
                          startsAt: "2026-11-13T08:00:00.000Z",
                          status: "cancelled",
                          editVersion: revision,
                        },
                      ],
                }
              : url.includes("/patient/")
                ? { items: [row], page: 1, hasNext: false }
                : {
                    ...row,
                    visit: { ...row.visit, editVersion: visitVersion },
                  },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    renderPatient(
      <PatientVisits
        patient={patient}
        lang="fr"
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.open }));
    const dialog = await screen.findByRole("dialog");
    (await within(dialog).findByRole("combobox", { name: t.choice })).focus();
    await user.keyboard("{Enter}{End}{Enter}");
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    revision = change === "visit revised" ? 1 : 2;
    visitVersion = change === "visit revised" ? 3 : 2;
    removed = change === "removed";
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await within(dialog).findByText(dt.changed);
    expect(
      within(dialog)
        .getByRole("button", { name: t.save })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(within(dialog).getByRole("combobox").textContent).toContain(
      doctor.name,
    );
    await user.click(within(dialog).getByRole("button", { name: dt.review }));
    await user.click(
      await within(dialog).findByRole("button", { name: dt.keepDraft }),
    );
    if (removed) {
      await within(dialog).findByText(
        translations.fr.visits.invalidAppointmentChoice,
      );
      expect(
        within(dialog)
          .getByRole("button", { name: t.save })
          .hasAttribute("disabled"),
      ).toBe(true);
    } else
      await waitFor(() =>
        expect(
          within(dialog)
            .getByRole("button", { name: t.save })
            .hasAttribute("disabled"),
        ).toBe(false),
      );
  },
);
it("hides protected appointment and patient details when link authorization is revoked", async () => {
  const t = copy.fr;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method === "PATCH"
              ? { error: "forbidden" }
              : url.endsWith("appointment-options")
                ? {
                    visitId: row.visit.id,
                    visitDay: "2026-11-13",
                    visitVersion: 2,
                    link: row.visit.appointmentLink,
                    items: [
                      {
                        id: appointmentId,
                        patientId: patient.id,
                        doctorId: doctor.id,
                        doctor: { id: doctor.id, name: doctor.name },
                        startsAt: "2026-11-13T08:00:00.000Z",
                        status: "cancelled",
                        editVersion: 1,
                      },
                    ],
                  }
                : { items: [row], page: 1, hasNext: false },
          ),
          { status: options?.method === "PATCH" ? 403 : 200 },
        ),
    ),
  );
  renderPatient(
    <PatientVisits patient={patient} lang="fr" canRead onExpired={() => {}} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: t.open }));
  const dialog = await screen.findByRole("dialog");
  (await within(dialog).findByRole("combobox", { name: t.choice })).focus();
  await user.keyboard("{Enter}{End}{Enter}");
  await user.click(within(dialog).getByRole("button", { name: t.save }));
  await within(dialog).findByText(translations.fr.visits.readDenied);
  expect(within(dialog).queryByText(patient.name)).toBeNull();
  expect(within(dialog).queryByRole("combobox")).toBeNull();
});

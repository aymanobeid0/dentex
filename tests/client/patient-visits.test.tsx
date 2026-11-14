// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientVisits } from "../../client/features/visits";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "History patient",
  fileNumber: "9",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "History doctor",
  eligible: false,
};
const waiting = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  status: "waiting",
  arrivedAt: "2026-11-13T09:00:00.000Z",
  recordedEndAt: null,
  editVersion: 1,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["ar", "fr"] as const)(
  "shows automatic closure reason, due midnight and processing time without a fabricated completion in %s",
  async (lang) => {
    const t = translations[lang].visits;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  ...waiting,
                  status: "auto_closed",
                  editVersion: 2,
                  autoClosure: {
                    effectiveClosedAt: "2026-11-14T00:00:00.000Z",
                    recordedAt: "2026-11-16T08:15:00.000Z",
                    reason: "clinic_day_end",
                  },
                },
              ],
              page: 1,
              hasNext: false,
            }),
          ),
      ),
    );
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    expect(
      await screen.findByText(t.attendanceStatuses.auto_closed),
    ).toBeTruthy();
    expect(
      screen.getByText(
        lang === "ar"
          ? "إغلاق تلقائي بنهاية يوم العيادة؛ لا يؤكد اكتمال الزيارة أو المغادرة."
          : "Clôture automatique en fin de journée du cabinet ; la fin de visite ou le départ ne sont pas confirmés.",
      ),
    ).toBeTruthy();
    expect(
      document.querySelector('time[datetime="2026-11-14T00:00:00.000Z"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('time[datetime="2026-11-16T08:15:00.000Z"]'),
    ).toBeTruthy();
    expect(screen.queryByText(new RegExp(t.endRecorded))).toBeNull();
    expect(screen.queryByText(new RegExp(t.entry))).toBeNull();
  },
);
it.each([
  {
    effectiveClosedAt: "2026-11-14T00:00:00.000Z",
    recordedAt: "2026-11-13T23:59:00.000Z",
    reason: "clinic_day_end",
  },
  {
    effectiveClosedAt: "2026-11-14T00:00:00.000Z",
    recordedAt: "2026-11-16T08:15:00.000Z",
    reason: "completed",
  },
])(
  "rejects an invalid automatic closure instead of displaying invented history (%j)",
  async (autoClosure) => {
    const t = translations.fr.visits;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  ...waiting,
                  status: "auto_closed",
                  editVersion: 2,
                  autoClosure,
                },
              ],
              page: 1,
              hasNext: false,
            }),
          ),
      ),
    );
    renderPatient(
      <PatientVisits
        patient={patient}
        lang="fr"
        canRead
        onExpired={() => {}}
      />,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(t.autoClosureReason)).toBeNull();
    expect(screen.queryByText(t.attendanceStatuses.auto_closed)).toBeNull();
  },
);
it.each([
  ["ar", "لا يوجد حضور أو زيارات مسجلة لهذا المريض."],
  ["fr", "Aucune présence ni visite enregistrée pour ce patient."],
] as const)(
  "uses a history-specific empty state in %s",
  async (lang, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [], page: 1, hasNext: false })),
      ),
    );
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    expect(await screen.findByText(message)).toBeTruthy();
  },
);
it.each(["ar", "fr"] as const)(
  "shows attendance separately from visits, paginates and preserves confirmed history on connection failure in %s",
  async (lang) => {
    const t = translations[lang].visits;
    let status = 200;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            status === 200
              ? {
                  items: url.endsWith("page=1")
                    ? [waiting]
                    : [
                        {
                          ...waiting,
                          status: "completed",
                          recordedEndAt: "2026-11-13T11:00:00.000Z",
                          editVersion: 3,
                          visit: {
                            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                            startedAt: "2026-11-13T10:00:00.000Z",
                            recordedEndAt: "2026-11-13T11:00:00.000Z",
                            editVersion: 2,
                            status: "completed",
                          },
                        },
                      ],
                  page: url.endsWith("page=1") ? 1 : 2,
                  hasNext: url.endsWith("page=1"),
                }
              : { error: status === 403 ? "forbidden" : "failed" },
          ),
          { status },
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
    const region = screen.getByRole("region", { name: t.history });
    await within(region).findByText(t.waiting);
    expect(within(region).queryByText(new RegExp(t.entry))).toBeNull();
    const user = userEvent.setup();
    await user.click(within(region).getByRole("button", { name: t.next }));
    await within(region).findByText(t.completed);
    expect(within(region).getByText(new RegExp(t.entry))).toBeTruthy();
    expect(within(region).getByText(new RegExp(t.endRecorded))).toBeTruthy();
    status = 503;
    await user.click(within(region).getByRole("button", { name: t.refresh }));
    await within(region).findByRole("alert");
    expect(within(region).getByText(t.completed)).toBeTruthy();
    status = 403;
    await user.click(within(region).getByRole("button", { name: t.refresh }));
    await within(region).findByText(t.readDenied);
    expect(within(region).queryByText(doctor.name)).toBeNull();
  },
);
it("does not read visits for an account without the administrative role", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderPatient(
    <PatientVisits
      patient={patient}
      lang="fr"
      canRead={false}
      onExpired={() => {}}
    />,
  );
  await waitFor(() => expect(fetcher).not.toHaveBeenCalled());
  expect(screen.queryByRole("region")).toBeNull();
});

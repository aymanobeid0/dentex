import { renderPatient as render } from "./render-patient";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { PatientPage } from "./controlled-patient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});
it.each(["ar", "fr"] as const)(
  "searches the clinic list and opens a result (%s)",
  async (lang) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], page: 1, hasNext: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "saved",
              name: "Marie",
              phone: "+22262112233",
              fileNumber: "42",
              isChild: true,
            },
          ],
          page: 1,
          hasNext: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "saved",
          name: "Marie",
          phone: "+22262112233",
          fileNumber: "42",
          isChild: true,
          gender: "female",
        }),
      });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(
      <PatientPage lang={lang} canRead canWrite={false} onExpired={() => {}} />,
    );
    expect(
      await screen.findByText(
        lang === "ar"
          ? "لا يوجد مرضى مسجلون بعد."
          : "Aucun patient enregistré pour le moment.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Marie" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: lang === "ar" ? "بحث" : "Rechercher",
      }),
    );
    const link = await screen.findByRole("button", { name: "Marie" });
    expect(screen.getByText("+22262112233").getAttribute("dir")).toBe("ltr");
    expect(
      screen.queryByRole("columnheader", {
        name: lang === "ar" ? "طفل" : "Enfant",
      }),
    ).toBeNull();
    expect(container.querySelector("section")?.getAttribute("dir")).toBe(
      lang === "ar" ? "rtl" : "ltr",
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/clinic/patients?q=Marie&page=1",
    );
    fireEvent.click(link);
    expect(await screen.findByRole("heading", { name: "Marie" })).toBeTruthy();
    expect(
      screen.getByText(lang === "ar" ? "طفل" : "Enfant", {
        selector: "span.patient-child",
      }),
    ).toBeTruthy();
  },
);
it("prevents repeated searches, clears stale results on failure, and retries the same search", async () => {
  let finish!: (value: object) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "saved",
            name: "Old patient",
            phone: "+22262112233",
            fileNumber: "42",
            isChild: false,
          },
        ],
        page: 1,
        hasNext: false,
      }),
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], page: 1, hasNext: false }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <PatientPage lang="fr" canRead canWrite={false} onExpired={() => {}} />,
  );
  await screen.findByRole("button", { name: "Old patient" });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "missing" },
  });
  const button = screen.getByRole("button", { name: "Rechercher" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: false, status: 500 });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Old patient")).toBeNull();
  expect(screen.queryByText("Aucun résultat pour cette recherche.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(
    await screen.findByText("Aucun résultat pour cette recherche."),
  ).toBeTruthy();
  expect(fetcher.mock.calls[2][0]).toBe(
    "/api/clinic/patients?q=missing&page=1",
  );
});
it.each([401, 403, 400, 500, "network"] as const)(
  "handles list failure without an empty success state (%s)",
  async (status) => {
    const expired = vi.fn();
    vi.stubGlobal(
      "fetch",
      status === "network"
        ? vi.fn().mockRejectedValue(Error("offline"))
        : vi.fn().mockResolvedValue({ ok: false, status }),
    );
    render(
      <PatientPage lang="ar" canRead canWrite={false} onExpired={expired} />,
    );
    if (status === 401)
      await waitFor(() => expect(expired).toHaveBeenCalledOnce());
    else expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("لا يوجد مرضى مسجلون بعد.")).toBeNull();
  },
);
it("uses server pagination and resets to page one for a new search", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], page: 1, hasNext: true }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], page: 2, hasNext: false }),
    })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], page: 1, hasNext: false }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <PatientPage lang="fr" canRead canWrite={false} onExpired={() => {}} />,
  );
  await screen.findByText("Aucun patient enregistré pour le moment.");
  expect(
    (screen.getByRole("button", { name: "Précédent" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await screen.findByText("Aucun patient sur cette page.");
  expect(fetcher.mock.calls[1][0]).toBe("/api/clinic/patients?q=&page=2");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  await screen.findByText("Aucun résultat pour cette recherche.");
  expect(fetcher.mock.calls[2][0]).toBe("/api/clinic/patients?q=Marie&page=1");
  fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
  await screen.findByText("Aucun patient enregistré pour le moment.");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
});
it("removes a previously loaded list when read permission is lost", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          id: "saved",
          name: "Private patient",
          phone: "+22262112233",
          fileNumber: "42",
          isChild: false,
        },
      ],
      page: 1,
      hasNext: false,
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <PatientPage lang="fr" canRead canWrite={false} onExpired={() => {}} />,
  );
  await screen.findByText("Private patient");
  rerender(
    <PatientPage
      lang="fr"
      canRead={false}
      canWrite={false}
      onExpired={() => {}}
    />,
  );
  expect(screen.queryByText("Private patient")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

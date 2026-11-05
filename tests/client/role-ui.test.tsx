import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPatient as render } from "./render-patient";
import { RolePermissionsPage } from "../../client/features/roles/pages/RolePermissionsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps the selected role stable while its permissions are being saved", async () => {
  let resolveSave!: (response: Response) => void;
  const save = new Promise<Response>((resolve) => {
    resolveSave = resolve;
  });
  const roles = [
    { id: "a", key: "dentist", editVersion: 1, permissions: ["patients.read"] },
    {
      id: "b",
      key: "receptionist",
      editVersion: 1,
      permissions: ["patients.write"],
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options?: RequestInit) =>
      options?.method === "PUT"
        ? save
        : Promise.resolve({
            ok: true,
            json: async () => ({
              roles,
              permissions: ["patients.read", "patients.write"],
            }),
          }),
    ),
  );
  render(<RolePermissionsPage lang="fr" onExpired={() => {}} />);
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Modifier les patients" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les autorisations" }),
  );
  const other = screen.getByRole("radio", { name: "Accueil" });
  await waitFor(() => expect((other as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(other);
  resolveSave({
    ok: true,
    json: async () => ({
      ...roles[0],
      editVersion: 2,
      permissions: ["patients.read", "patients.write"],
    }),
  } as Response);
  await waitFor(() =>
    expect(
      screen.getByText("Les autorisations ont été enregistrées."),
    ).toBeTruthy(),
  );
  fireEvent.click(other);
  expect(
    screen
      .getByRole("checkbox", { name: "Voir les patients" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen
      .getByRole("checkbox", { name: "Modifier les patients" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

import { IconButton } from "../../../ui/IconButton";
import { UsersRound } from "lucide-react";
import type { useClinics } from "../hooks/useClinics";
type Props = Pick<
  ReturnType<typeof useClinics>,
  "t" | "setAdminClinic" | "clinics" | "loadError" | "loadClinics"
>;
export function ClinicsTable({
  t,
  setAdminClinic,
  clinics,
  loadError,
  loadClinics,
}: Props) {
  return (
    <section className="card">
      {loadError ? (
        <div role="alert">
          {t.network}{" "}
          <button className="ui-button" onClick={loadClinics}>
            {t.retry}
          </button>
        </div>
      ) : clinics === null ? (
        <p role="status">{t.loading}</p>
      ) : clinics.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.code}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clinics.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <bdi>{c.code}</bdi>
                  </td>
                  <td>
                    <IconButton
                      label={t.manageAdmins}
                      tone="primary"
                      onClick={() => setAdminClinic(c)}
                    >
                      <UsersRound size={15} aria-hidden="true" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

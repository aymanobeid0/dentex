import { UsersRound } from "lucide-react";
import type { useClinics } from "../hooks/useClinics";
type Props = Pick<ReturnType<typeof useClinics>, "t" | "setAdminClinic" | "clinics" | "loadError" | "loadClinics">;
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
          <button className="language" onClick={loadClinics}>
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
                    <button
                      className="language"
                      onClick={() => setAdminClinic(c)}
                    >
                      <UsersRound size={15} aria-hidden="true" />
                      {t.manageAdmins}
                    </button>
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

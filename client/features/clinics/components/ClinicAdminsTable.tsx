import { KeyRound } from "lucide-react";
import type { useClinicAdmins } from "../hooks/useClinicAdmins";
type Props = Pick<
  ReturnType<typeof useClinicAdmins>,
  "t" | "admins" | "loadingError" | "setSelected" | "setSaved" | "load"
>;
export function ClinicAdminsTable({
  t,
  admins,
  loadingError,
  setSelected,
  setSaved,
  load,
}: Props) {
  return (
    <section className="card">
      {loadingError ? (
        <div role="alert">
          {t.error}{" "}
          <button className="language" onClick={load}>
            {t.retry}
          </button>
        </div>
      ) : admins === null ? (
        <p role="status">{t.loading}</p>
      ) : admins.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.username}</th>
                <th>{t.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td>{admin.name}</td>
                  <td>
                    <bdi>{admin.username}</bdi>
                  </td>
                  <td>{admin.active ? t.active : t.inactive}</td>
                  <td>
                    <button
                      className="language"
                      onClick={() => {
                        setSelected(admin);
                        setSaved(false);
                      }}
                    >
                      <KeyRound size={15} aria-hidden="true" />
                      {t.reset}
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

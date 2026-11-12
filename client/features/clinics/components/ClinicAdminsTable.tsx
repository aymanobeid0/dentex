import { IconButton } from "../../../ui/IconButton";
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
          <button className="ui-button" onClick={load}>
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
                  <td>
                    <span
                      className={
                        "badge " +
                        (admin.active ? "badge-success" : "badge-neutral")
                      }
                    >
                      <span className="badge-dot" aria-hidden />
                      {admin.active ? t.active : t.inactive}
                    </span>
                  </td>
                  <td>
                    <IconButton
                      label={t.reset}
                      tone="warning"
                      onClick={() => {
                        setSelected(admin);
                        setSaved(false);
                      }}
                    >
                      <KeyRound size={15} aria-hidden="true" />
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

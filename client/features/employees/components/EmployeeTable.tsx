import { KeyRound, Pencil, UserCheck, UserX } from "lucide-react";
import type { useEmployees } from "../hooks/useEmployees";
type Props = Pick<
  ReturnType<typeof useEmployees>,
  | "canManageAdmins"
  | "t"
  | "list"
  | "loadError"
  | "l"
  | "setAction"
  | "setNotice"
  | "roleName"
  | "load"
  | "open"
>;
export function EmployeeTable({
  canManageAdmins,
  t,
  list,
  loadError,
  l,
  setAction,
  setNotice,
  roleName,
  load,
  open,
}: Props) {
  return (
    <section className="card">
      {loadError ? (
        <div role="alert">
          {t.error}{" "}
          <button className="language" onClick={load}>
            {t.retry}
          </button>
        </div>
      ) : list === null ? (
        <p role="status">{t.loading}</p>
      ) : !list.length ? (
        <p>{t.empty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.username}</th>
                <th>{t.roles}</th>
                <th>{t.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>
                    <bdi>{employee.username}</bdi>
                  </td>
                  <td>{employee.roles.map(roleName).join(t.roleSeparator)}</td>
                  <td>{employee.active ? t.active : t.inactive}</td>
                  <td>
                    <div className="form-actions">
                      <button
                        className="language"
                        onClick={() => {
                          setNotice(null);
                          open(employee);
                        }}
                      >
                        <Pencil size={15} aria-hidden="true" />
                        {t.edit}
                      </button>
                      {(canManageAdmins ||
                        !employee.roles.some(
                          (role) => role.key === "admin",
                        )) && (
                        <>
                          <button
                            className="language"
                            onClick={() => {
                              setNotice(null);
                              setAction({ kind: "status", employee });
                            }}
                          >
                            {employee.active ? (
                              <UserX size={15} aria-hidden="true" />
                            ) : (
                              <UserCheck size={15} aria-hidden="true" />
                            )}
                            {employee.active ? l.disable : l.enable}
                          </button>
                          <button
                            className="language"
                            onClick={() => {
                              setNotice(null);
                              setAction({ kind: "reset", employee });
                            }}
                          >
                            <KeyRound size={15} aria-hidden="true" />
                            {l.reset}
                          </button>
                        </>
                      )}
                    </div>
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

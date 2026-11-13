import { IconButton } from "../../../ui/IconButton";
import { nameInitials } from "../../../ui/nameInitials";
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
          <button className="ui-button" onClick={load}>
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
                  <td>
                    <span className="row-name-cell">
                      <span className="row-avatar" aria-hidden>
                        {nameInitials(employee.name)}
                      </span>
                      {employee.name}
                    </span>
                  </td>
                  <td>
                    <bdi>{employee.username}</bdi>
                  </td>
                  <td>
                    {employee.roles.map((role, index) => (
                      <span key={role.id}>
                        <span className="badge badge-primary">
                          {roleName(role)}
                        </span>
                        {index < employee.roles.length - 1
                          ? t.roleSeparator
                          : ""}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (employee.active ? "badge-success" : "badge-neutral")
                      }
                    >
                      <span className="badge-dot" aria-hidden />
                      {employee.active ? t.active : t.inactive}
                    </span>
                  </td>
                  <td>
                    <div className="form-actions">
                      <IconButton
                        label={t.edit}
                        tone="primary"
                        onClick={() => {
                          setNotice(null);
                          open(employee);
                        }}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </IconButton>
                      {(canManageAdmins ||
                        !employee.roles.some(
                          (role) => role.key === "admin",
                        )) && (
                        <>
                          <IconButton
                            label={employee.active ? l.disable : l.enable}
                            tone={employee.active ? "danger" : "success"}
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
                          </IconButton>
                          <IconButton
                            label={l.reset}
                            tone="warning"
                            onClick={() => {
                              setNotice(null);
                              setAction({ kind: "reset", employee });
                            }}
                          >
                            <KeyRound size={15} aria-hidden="true" />
                          </IconButton>
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

import { type Lang } from "../../../shared/i18n";
import { RolePermissionEditor } from "../components/RolePermissionEditor";
import { useRolePermissions } from "../hooks/useRolePermissions";
export function RolePermissionsPage({
  lang,
  onExpired,
}: {
  lang: Lang;
  onExpired: () => void;
}) {
  const {
    t,
    roles,
    keys,
    selected,
    draft,
    setDraft,
    busy,
    error,
    saved,
    setSaved,
    load,
    role,
    choose,
    save,
  } = useRolePermissions({ lang, onExpired });
  return (
    <>
      <h1>{t.title}</h1>
      <p className="role-intro">{t.intro}</p>
      <p className="role-intro">{t.future}</p>
      {roles === null ? (
        error ? (
          <div role="alert">
            {t[error]}{" "}
            <button className="language" onClick={load}>
              {t.retry}
            </button>
          </div>
        ) : (
          <p role="status">{t.loading}</p>
        )
      ) : (
        <RolePermissionEditor
          lang={lang}
          t={t}
          roles={roles}
          keys={keys}
          selected={selected}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          error={error}
          saved={saved}
          setSaved={setSaved}
          role={role}
          choose={choose}
          save={save}
        />
      )}
    </>
  );
}

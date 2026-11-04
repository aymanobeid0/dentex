import { useEffect, useRef, useState } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import { readRolePermissions, saveRolePermissions } from "../api";
type Role = { id: string; key: string; permissions: string[] };
export function useRolePermissions({
  lang,
  onExpired,
}: {
  lang: Lang;
  onExpired: () => void;
}) {
  const fetch = useApi();
  const saving = useRef(false);
  const t = translations[lang].roles;
  const [roles, setRoles] = useState<Role[] | null>(null),
    [keys, setKeys] = useState<string[]>([]),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<"error" | "forbidden" | null>(null),
    [saved, setSaved] = useState(false);
  async function load() {
    setError(null);
    setRoles(null);
    try {
      const r = await readRolePermissions(fetch);
      if (r.status === 401) {
        onExpired();
        return;
      }
      if (!r.ok) {
        setError(r.status === 403 ? "forbidden" : "error");
        return;
      }
      const data = await r.json();
      setRoles(data.roles);
      setKeys(data.permissions);
      const role =
        data.roles.find((x: Role) => x.key === "dentist") ?? data.roles[0];
      setSelected(role?.id ?? "");
      setDraft(role?.permissions ?? []);
    } catch {
      setError("error");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const role = roles?.find((r) => r.id === selected);
  function choose(r: Role) {
    if (saving.current) return;
    setSelected(r.id);
    setDraft(r.permissions);
    setSaved(false);
    setError(null);
  }
  async function save() {
    if (!role || role.key === "admin" || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await saveRolePermissions(fetch, role.id, draft);
      if (r.status === 401) {
        onExpired();
        return;
      }
      if (!r.ok) {
        setError(r.status === 403 ? "forbidden" : "error");
        return;
      }
      const updated: Role = await r.json();
      setRoles(
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)) ??
          null,
      );
      setDraft(updated.permissions);
      setSaved(true);
    } catch {
      setError("error");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return {
    lang,
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
  };
}

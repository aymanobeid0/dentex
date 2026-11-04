import type { Clinic } from "../types";
import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import { listClinicAdmins, resetClinicAdminPassword } from "../api";
type Admin = { id: string; name: string; username: string; active: boolean };
export function useClinicAdmins({
  clinic,
  lang,
  onExpired,
}: {
  clinic: Clinic;
  lang: Lang;
  onExpired: () => void;
}) {
  const fetch = useApi();
  const t = translations[lang].clinicAdmins;
  const [admins, setAdmins] = useState<Admin[] | null>(null),
    [loadingError, setLoadingError] = useState(false),
    [selected, setSelected] = useState<Admin | null>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState<"required" | "error" | "notFound" | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function load() {
    setLoadingError(false);
    setAdmins(null);
    try {
      const r = await listClinicAdmins(fetch, clinic.id);
      if (r.status === 401) {
        onExpired();
        return;
      }
      if (!r.ok) throw Error();
      setAdmins(await r.json());
    } catch {
      setLoadingError(true);
    }
  }
  useEffect(() => {
    void load();
  }, [clinic.id]);
  async function reset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError("required");
      return;
    }
    if (!selected) return;
    setBusy(true);
    try {
      const r = await resetClinicAdminPassword(
        fetch,
        clinic.id,
        selected.id,
        password,
      );
      if (r.status === 401) {
        onExpired();
        return;
      }
      if (!r.ok) {
        setError(r.status === 404 ? "notFound" : "error");
        return;
      }
      setSelected(null);
      setPassword("");
      setSaved(true);
      await load();
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }
  return {
    t,
    admins,
    loadingError,
    selected,
    setSelected,
    password,
    setPassword,
    error,
    setError,
    busy,
    saved,
    setSaved,
    load,
    reset,
  };
}

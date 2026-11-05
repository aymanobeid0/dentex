import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../../shared/api/RequestProvider";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../../shared/query/useDisplayedQuery";
import { useDraftGuard, type NavigationGuard } from "../../../ui/useDraftGuard";
import { readRolePermissions, editRolePermissions } from "../api";
import type { Role } from "../types";
const same = (a: string[], b: string[]) =>
  [...a].sort().join() === [...b].sort().join();
export function useRolePermissions({
  lang,
  onExpired,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope(),
    t = translations[lang].roles;
  const query = useDisplayedQuery(
    ["roles", "permissions"],
    (signal) => readRolePermissions(request, signal),
    onExpired,
  );
  const [role, setRole] = useState<Role | null>(null),
    [draft, setDraft] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  const [error, setError] = useState<"error" | "forbidden" | null>(null),
    [saveIssue, setSaveIssue] = useState<"conflict" | "uncertain" | null>(null);
  const [reviewed, setReviewed] = useState<Role | null>(null),
    [reviewBusy, setReviewBusy] = useState(false),
    [reviewFailed, setReviewFailed] = useState(false);
  const saving = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    if (role || !query.data) return;
    const initial =
      query.data.roles.find((r) => r.key === "dentist") ?? query.data.roles[0];
    if (initial) {
      setRole(initial);
      setDraft(initial.permissions);
    }
  }, [role, query.data]);
  useEffect(() => {
    if (!query.blocked) return;
    generation.current++;
    setReviewed(null);
    void client.cancelQueries({ queryKey: [...scope, "roles", "review"] });
  }, [query.blocked, client, scope]);
  const mutation = useMutation({
    mutationFn: (input: { role: Role; permissions: string[] }) =>
      editRolePermissions(
        request,
        input.role.id,
        input.permissions,
        input.role.editVersion,
      ),
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: scope });
    },
  });
  const busy = mutation.isPending;
  const changed =
    !!role &&
    !!query.data?.roles.some(
      (r) => r.id === role.id && r.editVersion > role.editVersion,
    );
  const dirty = !!role && !same(draft, role.permissions);
  const guard = useDraftGuard(
    dirty || !!saveIssue,
    busy || reviewBusy,
    () => {
      setDraft(role?.permissions ?? []);
      setSaveIssue(null);
      setReviewed(null);
      setReviewFailed(false);
    },
    onNavigationGuardChange,
  );
  const saveBlocked =
    busy ||
    reviewBusy ||
    !!saveIssue ||
    changed ||
    query.blocked ||
    !query.data ||
    !query.online;
  function choose(next: Role) {
    if (next.id === role?.id || saving.current || reviewBusy) return;
    guard.requestLeave(() => {
      setRole(next);
      setDraft(next.permissions);
      setSaved(false);
      setError(null);
      setSaveIssue(null);
      setReviewed(null);
      setReviewFailed(false);
    });
  }
  async function review() {
    if (!role || busy || reviewBusy || !query.online) return;
    const current = ++generation.current;
    setReviewed(null);
    setReviewFailed(false);
    setReviewBusy(true);
    try {
      const result = await client.fetchQuery({
        queryKey: [...scope, "roles", "review", role.id],
        staleTime: 0,
        retry: false,
        queryFn: ({ signal }) => readRolePermissions(request, signal),
      });
      const latest = result.roles.find((r) => r.id === role.id);
      if (!latest) throw Error("Missing role");
      if (current === generation.current) setReviewed(latest);
    } catch {
      setReviewFailed(true);
    } finally {
      setReviewBusy(false);
    }
  }
  function acceptReview(keep: boolean) {
    if (!reviewed || query.blocked || !query.online) return;
    setRole(reviewed);
    if (!keep) setDraft(reviewed.permissions);
    setReviewed(null);
    setSaveIssue(null);
    setError(null);
    setReviewFailed(false);
    setSaved(false);
  }
  async function save() {
    if (!role || role.key === "admin" || saving.current || saveBlocked) return;
    saving.current = true;
    setError(null);
    setSaved(false);
    try {
      const result = await mutation.mutateAsync({
        role,
        permissions: [...draft],
      });
      setRole(result);
      setDraft(result.permissions);
      setSaved(true);
      guard.release();
    } catch (error) {
      if (error instanceof ApiError && error.code === "edit_conflict")
        setSaveIssue("conflict");
      else if (
        !(error instanceof ApiError) ||
        error.kind === "uncertain" ||
        error.kind === "network" ||
        error.status >= 500
      )
        setSaveIssue("uncertain");
      else if (error.status === 401) onExpired();
      else setError(error.status === 403 ? "forbidden" : "error");
    } finally {
      saving.current = false;
    }
  }
  return {
    lang,
    t,
    roles: query.data?.roles ?? null,
    keys: query.data?.permissions ?? [],
    selected: role?.id ?? "",
    draft,
    setDraft,
    busy,
    error: query.blocked
      ? ("forbidden" as const)
      : !query.data && query.error
        ? ("error" as const)
        : error,
    saved,
    setSaved,
    load: () => void query.refetch({ cancelRefetch: false }),
    role,
    choose,
    save,
    guard,
    saveBlocked,
    saveIssue,
    changed,
    review,
    reviewed: query.blocked ? null : reviewed,
    reviewBusy,
    reviewFailed,
    acceptReview,
    online: query.online,
    stale: query.stale,
    updating: query.isFetching,
  };
}

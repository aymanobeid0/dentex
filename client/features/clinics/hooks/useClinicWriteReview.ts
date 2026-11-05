import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../shared/api/request";
import { useQueryScope } from "../../../shared/query/QueryScope";
/** Explicit recovery reads never authorize a write by themselves. */
export function useClinicWriteReview<T>(
  key: readonly string[],
  read: (signal: AbortSignal) => Promise<T>,
  blocked: boolean,
  online: boolean,
  onExpired: () => void,
) {
  const client = useQueryClient(),
    scope = useQueryScope();
  const [uncertain, setUncertain] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const generation = useRef(0);
  const query = useQuery({
    queryKey: [...scope, ...key],
    queryFn: ({ signal }) => read(signal),
    enabled: false,
    retry: false,
    networkMode: "always",
  });
  const keyId = JSON.stringify(key);
  useEffect(() => {
    if (!blocked && online) return;
    generation.current++;
    setReviewed(false);
    setAcknowledged(false);
    void client.cancelQueries({ queryKey: [...scope, ...key] });
  }, [blocked, online, client, scope, keyId]);
  function clear() {
    generation.current++;
    setUncertain(false);
    setReviewed(false);
    setAcknowledged(false);
  }
  function markUncertain() {
    generation.current++;
    setUncertain(true);
    setReviewed(false);
    setAcknowledged(false);
  }
  async function review() {
    if (blocked || !online || query.isFetching) return;
    const current = ++generation.current;
    setReviewed(false);
    setAcknowledged(false);
    const result = await query.refetch();
    if (current === generation.current && !result.error) setReviewed(true);
    if (result.error instanceof ApiError && result.error.status === 401)
      onExpired();
  }
  return {
    uncertain,
    reviewed: reviewed && !blocked,
    acknowledged,
    query,
    clear,
    markUncertain,
    review,
    acknowledge: () => {
      if (reviewed && !blocked && online && !query.isFetching)
        setAcknowledged(true);
    },
    saveBlocked:
      blocked || !online || query.isFetching || (uncertain && !acknowledged),
  };
}

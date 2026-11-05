import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ApiError } from "../api/request";
import { useQueryScope } from "./QueryScope";
import { useReadAvailability } from "./useReadAvailability";

/** Shared read policy; resource keys and DTOs remain owned by each feature. */
export function useDisplayedQuery<T>(
  key: readonly unknown[],
  read: (signal: AbortSignal) => Promise<T>,
  onExpired: () => void,
  enabled = true,
) {
  const scope = useQueryScope(),
    availability = useReadAvailability();
  const query = useQuery({
    queryKey: [...scope, ...key],
    queryFn: ({ signal }) => read(signal),
    enabled: enabled && availability.online && availability.visible,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401)
      expired.current();
  }, [query.error]);
  const blocked =
    query.error instanceof ApiError &&
    [400, 401, 403, 404].includes(query.error.status);
  return {
    ...query,
    data: blocked ? undefined : query.data,
    blocked,
    online: availability.online,
    stale: !availability.online || (!!query.error && !!query.data),
  };
}

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/request";
import { useReadAvailability } from "../../shared/query/useReadAvailability";
import type { Session } from "./session/Session";
import type { Account } from "./types";
export function useIdentity(session: Session) {
  const availability = useReadAvailability();
  const query = useQuery<Account | null>({
    queryKey: session.key,
    queryFn: ({ signal }) => session.readIdentity(signal),
    enabled:
      availability.online &&
      availability.visible &&
      session.client.getQueryData(session.key) !== null,
    // Seeded identity came from a confirmed response; the next poll revalidates it.
    refetchOnMount: false,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  return {
    account: query.data ?? null,
    anonymous: query.data === null,
    boot: query.isPending && query.fetchStatus === "fetching",
    stale: !availability.online || query.isError,
    failed: query.isError,
    refresh: () => session.refresh(),
    error: query.error instanceof ApiError ? query.error : null,
  };
}

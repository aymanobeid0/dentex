import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { ApiError, createSessionRequest, isTemporaryReadError, readJson, RequestContext } from './api';
import { useReadAvailability } from './read-availability';

export type Account = { kind: 'platform'; username: string } | {
  kind: 'clinic'; username: string; name: string; clinic: { id: string; name: string; code: string }; roles: string[]; permissions: string[];
};
const identity = (account: Account | null) => account ? JSON.stringify([account.kind, account.kind === 'clinic' ? account.clinic.id : null, account.username]) : 'anonymous';
let nextSession = 0;
const QueryScopeContext = createContext<readonly unknown[] | null>(null);
export function useQueryScope() {
  const scope = useContext(QueryScopeContext);
  if (!scope) throw new Error('SessionProvider is required');
  return scope;
}

export class Session {
  readonly id = ++nextSession;
  readonly client = new QueryClient({ defaultOptions: {
    queries: { retry: (count, error) => count < 2 && isTemporaryReadError(error), retryDelay: count => Math.min(1000 * 2 ** count, 4000), refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false, networkMode: 'always' },
  } });
  readonly transport = createSessionRequest(() => this.replace(null));
  readonly key: readonly unknown[];
  private retired = false;
  private owner: string;
  constructor(private changed: (session: Session) => void, account?: Account | null) {
    this.owner = account === undefined ? 'bootstrap' : identity(account);
    this.key = ['session', this.id, this.owner, 'identity'];
    if (account !== undefined) this.client.setQueryData(this.key, account);
  }
  replace(account: Account | null) {
    if (this.retired) return;
    this.retired = true;
    this.transport.retire();
    void this.client.cancelQueries();
    this.client.clear();
    this.changed(new Session(this.changed, account));
  }
  async readIdentity(signal?: AbortSignal) {
    const account = await readJson<Account>(this.transport.request, '/api/auth/me', { signal });
    if (identity(account) !== this.owner) this.replace(account);
    return account;
  }
  async refresh() {
    await this.client.fetchQuery({ queryKey: this.key, queryFn: ({ signal }) => this.readIdentity(signal) });
  }
}

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <QueryClientProvider client={session.client}><QueryScopeContext value={session.key.slice(0, -1)}><RequestContext value={session.transport.request}>{children}</RequestContext></QueryScopeContext></QueryClientProvider>;
}

export function useIdentity(session: Session) {
  const availability = useReadAvailability();
  const query = useQuery<Account | null>({
    queryKey: session.key,
    queryFn: ({ signal }) => session.readIdentity(signal),
    enabled: availability.online && availability.visible && session.client.getQueryData(session.key) !== null,
    // Seeded identity came from a confirmed response; the next poll revalidates it.
    refetchOnMount: false,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  return { account: query.data ?? null, boot: query.isPending && query.fetchStatus === 'fetching', stale: !availability.online || query.isError, failed: query.isError, refresh: () => session.refresh(), error: query.error instanceof ApiError ? query.error : null };
}

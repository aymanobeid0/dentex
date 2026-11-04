import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RequestContext } from "../../../shared/api/RequestProvider";
import { QueryScopeContext } from "../../../shared/query/QueryScope";
import type { Session } from "./Session";
export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={session.client}>
      <QueryScopeContext value={session.key.slice(0, -1)}>
        <RequestContext value={session.transport.request}>
          {children}
        </RequestContext>
      </QueryScopeContext>
    </QueryClientProvider>
  );
}

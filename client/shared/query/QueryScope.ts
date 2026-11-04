import { createContext, useContext } from "react";
export const QueryScopeContext = createContext<readonly unknown[] | null>(null);
export function useQueryScope() {
  const scope = useContext(QueryScopeContext);
  if (!scope) throw new Error("SessionProvider is required");
  return scope;
}

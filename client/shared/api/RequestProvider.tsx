import { createContext, useContext } from "react";
import type { ApiRequest } from "./request";
// Infrastructure only: no API data is copied into this context.
export const RequestContext = createContext<ApiRequest | null>(null);
export function useApi(): ApiRequest {
  return useContext(RequestContext) ?? ((url, options) => fetch(url, options));
}

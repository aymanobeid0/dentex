import { QueryClient } from "@tanstack/react-query";
import { isTemporaryReadError } from "../api/request";
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => count < 2 && isTemporaryReadError(error),
        retryDelay: (count) => Math.min(1000 * 2 ** count, 4000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/RequestProvider";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../shared/query/useDisplayedQuery";
import { readTreatmentPlans, writeTreatment } from "./treatments.api";
export function useTreatmentPlans(
  patientId: string,
  onExpired: () => void,
  enabled = true,
) {
  const request = useApi();
  return useDisplayedQuery(
    ["visits", "treatment-plans", patientId],
    (signal) => readTreatmentPlans(request, patientId, signal),
    onExpired,
    enabled,
  );
}
export function useTreatmentWrite() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method,
    }: {
      path: string;
      body: object;
      method?: string;
    }) => writeTreatment(request, path, body, method),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "visits"] });
    },
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/RequestProvider";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../shared/query/useDisplayedQuery";
import {
  readTreatmentPlans,
  writeTreatment,
  readVisitTreatments,
  writeProcedure,
  type ProcedureCommand,
  type TreatmentPlan,
} from "./treatments.api";
export function useVisitTreatments(
  attendanceId: string,
  onExpired: () => void,
) {
  const request = useApi();
  return useDisplayedQuery(
    ["visits", "procedures", attendanceId],
    (signal) => readVisitTreatments(request, attendanceId, signal),
    onExpired,
  );
}
export function useProcedureWrite() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return useMutation({
    mutationFn: (command: ProcedureCommand) => writeProcedure(request, command),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: (data, command) => {
      const attendanceId =
        command.kind === "record"
          ? command.attendanceId
          : data.items.find((row) => row.id === command.id)!.visit.attendanceId;
      client.setQueryData(
        [...scope, "visits", "procedures", attendanceId],
        data,
      );
      client.setQueryData(
        [...scope, "visits", "treatment-plans", data.patientId],
        { items: data.plans },
      );
      void client.invalidateQueries({ queryKey: [...scope, "visits"] });
    },
  });
}
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
    onSuccess: (data) => {
      client.setQueryData<{items:TreatmentPlan[]}>([...scope,"visits","treatment-plans",data.patientId],previous=>({items:previous?.items.some(plan=>plan.id===data.id)?previous.items.map(plan=>plan.id===data.id?data:plan):[data,...(previous?.items??[])]}));
      void client.invalidateQueries({ queryKey: [...scope, "visits"] });
    },
  });
}

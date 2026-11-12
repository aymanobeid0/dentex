import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/RequestProvider";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../shared/query/useDisplayedQuery";
import { bookAppointment, readDoctors, type BookingInput } from "./api";
export function useBooking(
  open: boolean,
  canWrite: boolean,
  onExpired: () => void,
) {
  const request = useApi(),
    scope = useQueryScope(),
    client = useQueryClient();
  const doctors = useDisplayedQuery(
    ["appointments", "doctors"],
    (signal) => readDoctors(request, signal),
    onExpired,
    open && canWrite,
  );
  const mutation = useMutation({
    mutationFn: (input: BookingInput) => bookAppointment(request, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "appointments"] });
    },
  });
  return { doctors, mutation };
}

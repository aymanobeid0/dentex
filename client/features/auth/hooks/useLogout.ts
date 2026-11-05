import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../../../shared/api/request";
import { useApi } from "../../../shared/api/RequestProvider";
import { useReadAvailability } from "../../../shared/query/useReadAvailability";
import { logoutAccount } from "../api";
export function useLogout(onLoggedOut: () => void) {
  const request = useApi(),
    availability = useReadAvailability();
  const mutation = useMutation({
    mutationFn: () => logoutAccount(request),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const [error, setError] = useState(""),
    sending = useRef(false),
    busy = mutation.isPending;
  async function logout() {
    if (sending.current || busy) return;
    if (!availability.online) {
      setError("network");
      return;
    }
    sending.current = true;
    setError("");
    try {
      await mutation.mutateAsync();
      onLoggedOut();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(
        error instanceof ApiError &&
          (error.kind === "uncertain" ||
            error.kind === "network" ||
            error.status >= 500 ||
            error.status === 408)
          ? "uncertain"
          : "network",
      );
    } finally {
      mutation.reset();
      sending.current = false;
    }
  }
  return { busy, error, logout };
}

import { useState } from "react";
import { ApiError } from "../../../shared/api/request";
import { useApi } from "../../../shared/api/RequestProvider";
import { logoutAccount } from "../api";
export function useLogout(onLoggedOut: () => void) {
  const request = useApi();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const response = await logoutAccount(request);
      if (!response.ok) throw Error();
      onLoggedOut();
    } catch (error) {
      setError(
        error instanceof ApiError && error.kind === "uncertain"
          ? "uncertain"
          : "network",
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, logout };
}

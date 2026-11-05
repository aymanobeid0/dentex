import { ApiError, type ApiRequest } from "../../shared/api/request";
export async function changePassword(
  request: ApiRequest,
  currentPassword: string,
  newPassword: string,
) {
  const response = await request("/api/clinic/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status === 401 ? "expired" : "http",
      response.status,
      body.error,
    );
  }
  if (response.status !== 204) throw new ApiError("uncertain");
}

import { expect, it } from "vitest";
import { loginFailure } from "../../client/features/auth/login-errors";
it("distinguishes credential, rate-limit, origin, and server errors", () => {
  expect(loginFailure(401)).toBe("invalid");
  expect(loginFailure(400)).toBe("invalid");
  expect(loginFailure(429)).toBe("limit");
  expect(loginFailure(403)).toBe("origin");
  expect(loginFailure(500)).toBe("server");
});

import { createAppRouter } from "../../client/app/App";
import { RouterProvider } from "react-router/dom";
import { afterEach } from "vitest";

const routers = new Set<ReturnType<typeof createAppRouter>>();
// Tests mount the production application/router at the approved application seam.
// Construct before render, just as entry.tsx does, and dispose after each mount.
export function application() {
  const router = createAppRouter();
  routers.add(router);
  return <RouterProvider router={router} />;
}
afterEach(() => {
  for (const router of routers) router.dispose();
  routers.clear();
});

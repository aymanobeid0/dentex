import { afterEach, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const folders: string[] = [];
const cli = resolve("scripts/check-dev.mjs");
const secret = "credential-must-not-appear-in-output";
afterEach(() => {
  const base = realpathSync(tmpdir()) + sep;
  for (const folder of folders.splice(0)) {
    if (!realpathSync(folder).startsWith(base))
      throw Error("Fixture cleanup outside temporary directory");
    rmSync(folder, { recursive: true, force: true });
  }
});
function run(
  overrides: Record<string, string> = {},
  args = ["--config-only", "--json"],
) {
  const folder = mkdtempSync(join(tmpdir(), "dentex-check-dev-"));
  folders.push(folder);
  writeFileSync(
    join(folder, "package.json"),
    JSON.stringify({ name: "dentex", type: "module" }),
  );
  writeFileSync(
    join(folder, "vite.config.mjs"),
    'export default { server: { port: 5151, strictPort: true, proxy: { "/api": "http://127.0.0.1:5152" } } };',
  );
  const env = {
    PORT: "5152",
    HOST: "127.0.0.1",
    APP_ORIGIN: "http://127.0.0.1:5151",
    DATABASE_URL: `postgresql://user:${secret}@127.0.0.1:55460/dentex_dev`,
    JWT_SECRET: secret,
    ...overrides,
  };
  writeFileSync(
    join(folder, ".env"),
    Object.entries(env)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n"),
  );
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: folder,
    encoding: "utf8",
    timeout: 20000,
  });
  expect(result.stdout + result.stderr).not.toContain(secret);
  return { status: result.status, report: JSON.parse(result.stdout) };
}
it("validates declared configuration without claiming runtime readiness", () => {
  const { status, report } = run();
  expect(status).toBe(0);
  expect(report).toMatchObject({
    scope: "configuration-only",
    ok: true,
    ready: false,
  });
});
it.each([
  [{ APP_ORIGIN: "http://127.0.0.1:5173" }, "app-origin"],
  [{ PORT: "3000" }, "api-proxy"],
  [{ PORT: "5151" }, "api-port"],
  [
    {
      DATABASE_URL: `postgresql://user:${secret}@remote.invalid:55460/dentex_dev`,
    },
    "development-database",
  ],
  [
    { DATABASE_URL: `postgresql://user:${secret}@127.0.0.1:55460/dentex_test` },
    "development-database",
  ],
  [{ DATABASE_URL: "not-a-url" }, "configuration"],
] as const)(
  "rejects inconsistent or unsafe local configuration (%s)",
  (overrides, failedCheck) => {
    const { status, report } = run(overrides);
    expect(status).toBe(1);
    expect(report).toMatchObject({ ok: false, ready: false });
    expect(report.checks.at(-1)).toEqual({ name: failedCheck, ok: false });
  },
);
it("rejects unknown options without printing their contents", () => {
  const { status, report } = run({}, [`--${secret}`, "--json"]);
  expect(status).toBe(1);
  expect(report.checks).toEqual([{ name: "arguments", ok: false }]);
});
it("does not declare a different checkout ready from configuration alone", () => {
  const { status, report } = run({}, ["--json"]);
  expect(status).toBe(1);
  expect(report.ready).toBe(false);
  expect([
    "windows-process-inspection",
    "workspace-listener-5151",
    "process-inspection",
  ]).toContain(report.checks.at(-1).name);
}, 30000);

import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse } from "dotenv";
import { resolveConfig } from "vite";
import pg from "pg";

const execute = promisify(execFile);
const checks = [];
const configurationOnly = process.argv.includes("--config-only");
const json = process.argv.includes("--json");
let database;
let phase = "configuration";
function requireCheck(name, pass) {
  checks.push({ name, ok: Boolean(pass) });
  if (!pass) throw new Error(name);
}
async function http(url, options) {
  return fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(3000),
  });
}
try {
  requireCheck(
    "arguments",
    process.argv
      .slice(2)
      .every((arg) => ["--config-only", "--json"].includes(arg)),
  );
  const root = await realpath(process.cwd());
  const manifest = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  requireCheck("project-root", manifest.name === "dentex");
  const env = parse(await readFile(resolve(root, ".env"), "utf8"));
  const vite = await resolveConfig({ root, logLevel: "silent" }, "serve");
  const frontendPort = vite.server.port;
  const apiPort = Number(env.PORT || 3000);
  const origin = new URL(env.APP_ORIGIN);
  const databaseUrl = new URL(env.DATABASE_URL);
  const proxy = vite.server.proxy?.["/api"];
  const proxyTarget = typeof proxy === "string" ? proxy : proxy?.target;
  requireCheck(
    "frontend-port",
    Number.isInteger(frontendPort) &&
      frontendPort > 0 &&
      frontendPort <= 65535 &&
      vite.server.strictPort === true,
  );
  requireCheck(
    "api-port",
    Number.isInteger(apiPort) &&
      apiPort > 0 &&
      apiPort <= 65535 &&
      apiPort !== frontendPort,
  );
  requireCheck(
    "app-origin",
    origin.origin === `http://127.0.0.1:${frontendPort}` &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash &&
      !origin.username &&
      !origin.password,
  );
  requireCheck(
    "api-proxy",
    String(proxyTarget) === `http://127.0.0.1:${apiPort}` &&
      (!env.HOST || env.HOST === "127.0.0.1"),
  );
  requireCheck(
    "development-database",
    databaseUrl.protocol === "postgresql:" &&
      ["127.0.0.1", "localhost"].includes(databaseUrl.hostname) &&
      databaseUrl.port === "55460" &&
      databaseUrl.pathname === "/dentex_dev",
  );
  if (!configurationOnly) {
    requireCheck("windows-process-inspection", process.platform === "win32");
    // Return only ownership verdicts; process command lines may contain secrets.
    const prefix = (root + sep).toLowerCase().replaceAll("'", "''");
    const command = `$ErrorActionPreference='Stop'; $prefix='${prefix}'; $rows=@(foreach($port in @(${frontendPort},${apiPort})){ $listeners=@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue); $owned=$listeners.Count -gt 0; foreach($listener in $listeners){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$listener.OwningProcess); if(!$p.CommandLine -or !$p.CommandLine.ToLower().Replace([char]47,[char]92).Contains($prefix)){$owned=$false}}; [PSCustomObject]@{port=$port;owned=$owned}}); ConvertTo-Json -Compress -InputObject $rows`;
    phase = "process-inspection";
    const { stdout } = await execute(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(command, "utf16le").toString("base64"),
      ],
      { timeout: 20000, windowsHide: true },
    );
    const listeners = JSON.parse(stdout.replace(/^\uFEFF/, "").trim());
    for (const port of [frontendPort, apiPort])
      requireCheck(
        `workspace-listener-${port}`,
        listeners.some((item) => item.port === port && item.owned),
      );

    phase = "development-volume";
    const { stdout: storage } = await execute(
      "docker",
      [
        "inspect",
        "dentex-database-1",
        "--format",
        '{"health":{{json .State.Health.Status}},"mounts":{{json .Mounts}}}',
      ],
      { timeout: 5000, windowsHide: true },
    );
    const container = JSON.parse(storage);
    requireCheck(
      "development-volume",
      container.health === "healthy" &&
        container.mounts?.some(
          (mount) =>
            mount.Name === "dentex_database_data" &&
            mount.Destination === "/var/lib/postgresql",
        ),
    );
    phase = "database-connection";
    database = new pg.Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      query_timeout: 3000,
    });
    await database.connect();
    const result = await database.query("SELECT current_database() AS name");
    requireCheck("database-connection", result.rows[0]?.name === "dentex_dev");

    phase = "frontend-http";
    requireCheck("frontend-http", (await http(origin.origin)).status === 200);
    for (const [name, url] of [
      ["proxy-http", `${origin.origin}/api/auth/me`],
      ["api-http", `http://127.0.0.1:${apiPort}/api/auth/me`],
    ]) {
      phase = name;
      const response = await http(url);
      requireCheck(
        name,
        response.status === 401 &&
          (await response.json()).error === "unauthorized",
      );
    }
    phase = "accepted-origin";
    const response = await http(`${origin.origin}/api/auth/clinic/login`, {
      method: "POST",
      headers: { Origin: origin.origin, "Content-Type": "application/json" },
      body: "{}",
    });
    requireCheck(
      "accepted-origin",
      response.status === 400 &&
        (await response.json()).error === "invalid_input",
    );
  }
} catch {
  // Never print raw errors, URLs, environment values, Docker output or credentials.
  if (!checks.length || checks.at(-1).ok)
    checks.push({ name: phase, ok: false });
  process.exitCode = 1;
} finally {
  if (database) await database.end().catch(() => {});
}
const report = {
  scope: configurationOnly ? "configuration-only" : "local-runtime",
  ok: !process.exitCode,
  ready: !configurationOnly && !process.exitCode,
  checks,
};
if (json) console.log(JSON.stringify(report));
else {
  for (const check of checks)
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  console.log(
    configurationOnly
      ? "Configuration check only; runtime and login are not verified."
      : report.ready
        ? "Local runtime verified. Browser access and account login still require separate verification."
        : "Local runtime verification failed. No settings or data were changed.",
  );
}

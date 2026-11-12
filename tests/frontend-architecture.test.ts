import { expect, it } from "vitest";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

it("accepts feature composition and rejects forbidden frontend dependency paths", () => {
  const fixture = mkdtempSync(resolve(".scratch/frontend-fixture-"));
  const cli = resolve(
    "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
  );
  const write = (file: string, source: string) => {
    mkdirSync(join(fixture, file, ".."), { recursive: true });
    writeFileSync(join(fixture, file), source);
  };
  try {
    copyFileSync(
      ".dependency-cruiser.frontend.cjs",
      join(fixture, ".dependency-cruiser.frontend.cjs"),
    );
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { moduleResolution: "Bundler", module: "ESNext" },
      }),
    );
    write("client/features/auth/internal.ts", "export const value = 1;");
    write(
      "client/features/auth/index.ts",
      "export { value } from './internal';",
    );
    write("client/features/patients/index.ts", "export const patients = 1;");
    write("client/shared/value.ts", "export const shared = 1;");
    write("client/ui/value.ts", "export const ui = 1;");
    write("client/app/App.ts", "export { value } from '../features/auth';");
    const routerExports =
      "export { createBrowserRouter } from 'react-router'; export { RouterProvider } from 'react-router/dom';";
    write("client/app/router.ts", routerExports);
    const run = (json = false) =>
      spawnSync(
        process.execPath,
        [
          cli,
          "client",
          "--config",
          ".dependency-cruiser.frontend.cjs",
          ...(json ? ["--output-type", "json"] : []),
        ],
        { cwd: fixture, encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    const cases = [
      [
        "client/shared/value.ts",
        "export { value } from '../features/auth';",
        "foundation-has-no-domain",
      ],
      [
        "client/ui/value.ts",
        "export { value } from '../app/App';",
        "foundation-has-no-domain",
      ],
      [
        "client/features/patients/index.ts",
        "export { value } from '../auth';",
        "isolated-feature-patients",
      ],
      [
        "client/features/auth/internal.ts",
        "export { value } from '../../app/App';",
        "features-have-no-app",
      ],
      [
        "client/app/App.ts",
        "export { value } from '../features/auth/internal';",
        "public-interface-only-auth",
      ],
      [
        "client/shared/value.ts",
        "export { missing } from './missing';",
        "no-unresolved",
      ],
      [
        "client/app/router.ts",
        "export * from 'react-router/nonexistent-private-subpath';",
        "no-unresolved",
      ],
      [
        "client/features/auth/internal.ts",
        "export { value } from './index';",
        "no-cycles",
      ],
    ];
    for (const [file, source, rule] of cases) {
      const original = file.endsWith("router.ts")
        ? routerExports
        : file.endsWith("internal.ts")
          ? "export const value = 1;"
          : file.endsWith("App.ts")
            ? "export { value } from '../features/auth';"
            : "export const value = 1;";
      write(file, source);
      const rejected = run();
      expect(rejected.status, rule).toBeGreaterThan(0);
      const report = JSON.parse(run(true).stdout);
      expect(
        report.summary.violations.some(
          (item: { rule: { name: string } }) => item.rule.name === rule,
        ),
        rule,
      ).toBe(true);
      write(file, original);
      expect(run().status, `restored ${rule}`).toBe(0);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}, 120000);

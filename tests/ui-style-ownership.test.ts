import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
it("accepts shared ownership and feature composition, rejecting nested overrides and token duplication", () => {
  const folder = mkdtempSync(join(tmpdir(), "dentex-style-"));
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve("scripts/check-ui-styles.mjs"), folder],
      { encoding: "utf8" },
    );
  try {
    mkdirSync(join(folder, "client/ui"), { recursive: true });
    mkdirSync(join(folder, "client/features/patients"), { recursive: true });
    writeFileSync(
      join(folder, "client/ui/components.css"),
      ".ui-button { height: var(--control-h); }",
    );
    const feature = join(folder, "client/features/patients/patients.css");
    writeFileSync(feature, ".patient-data { display: grid; gap: 16px; }");
    expect(run().status).toBe(0);
    writeFileSync(
      feature,
      "@media(max-width:760px) { .patients .ui-button { height: 29px; } }",
    );
    expect(run().status).toBe(1);
    expect(run().stderr).toContain("shared component override");
    writeFileSync(feature, ":root { --control-h: 29px; }");
    expect(run().status).toBe(1);
    writeFileSync(
      feature,
      "@keyframes local-fix { from { opacity: 0; } to { opacity: 1; } }",
    );
    expect(run().status).toBe(1);
  } finally {
    if (
      !resolve(folder).startsWith(resolve(tmpdir()) + sep) ||
      !folder.includes("dentex-style-")
    )
      throw Error("Unexpected test folder");
    rmSync(folder, { recursive: true, force: true });
  }
});

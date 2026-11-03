import { expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

it('rejects Prisma and HTTP dependencies in business rules but accepts repository access', async () => {
  const lint = new ESLint();
  for (const source of [
    "import type { Prisma } from '../../../generated/prisma/client';",
    "import type { Request } from 'express';",
    'database.user.findMany();',
    'database.$transaction(async () => {});',
    'database.$queryRaw`SELECT 1`;',
  ]) {
    const [result] = await lint.lintText(source, { filePath: 'server/modules/auth/auth.service.ts' });
    expect(result.errorCount, source).toBeGreaterThan(0);
  }
  const [repository] = await lint.lintText("import type { Prisma } from '../../../generated/prisma/client'; database.user.findMany();", { filePath: 'server/modules/auth/auth.repository.ts' });
  expect(repository.errorCount).toBe(0);
  const [service] = await lint.lintText("import type { PlatformSession } from './auth.dto'; export const valid = true;", { filePath: 'server/modules/auth/auth.service.ts' });
  expect(service.errorCount).toBe(0);
});

it('rejects internal module imports and dependency cycles, accepting the public interface', () => {
  const fixture = mkdtempSync(resolve('.scratch/architecture-fixture-'));
  const cli = resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
  const write = (path: string, content: string) => writeFileSync(join(fixture, path), content);
  try {
    mkdirSync(join(fixture, 'server/modules/auth'), { recursive: true });
    mkdirSync(join(fixture, 'server/modules/example'), { recursive: true });
    copyFileSync('.dependency-cruiser.cjs', join(fixture, '.dependency-cruiser.cjs'));
    write('tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'Bundler', module: 'ESNext' } }));
    write('server/modules/auth/auth.dto.ts', 'export const value = 1;');
    write('server/modules/auth/index.ts', "export { value } from './auth.dto';");
    write('server/modules/example/index.ts', "export { value } from '../auth';");
    const args = [cli, 'server', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'];
    const good = JSON.parse(execFileSync(process.execPath, args, { cwd: fixture, encoding: 'utf8' }));
    expect(good.summary.error).toBe(0);
    write('server/modules/example/index.ts', "export { value } from '../auth/auth.dto';");
    const bad = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8' });
    expect(JSON.parse(bad.stdout).summary.error).toBeGreaterThan(0);
    expect(spawnSync(process.execPath, args.slice(0, -2), { cwd: fixture, encoding: 'utf8' }).status).toBe(1);
    expect(JSON.parse(bad.stdout).summary.violations.some((item: { rule: { name: string } }) => item.rule.name === 'public-interface-only-auth')).toBe(true);
    write('server/modules/example/index.ts', "export { value } from '../auth';");
    write('server/modules/auth/auth.dto.ts', "export { value } from '../example';");
    const cycle = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8' });
    expect(JSON.parse(cycle.stdout).summary.error).toBeGreaterThan(0);
    expect(spawnSync(process.execPath, args.slice(0, -2), { cwd: fixture, encoding: 'utf8' }).status).toBe(1);
    expect(JSON.parse(cycle.stdout).summary.violations.some((item: { rule: { name: string } }) => item.rule.name === 'no-cycles')).toBe(true);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}, 30000);

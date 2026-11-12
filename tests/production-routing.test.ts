import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the real HTTP composition in a separate production process. Its cwd
// contains only synthetic static files, independent of build artifacts and dev.
const folder = mkdtempSync(join(tmpdir(), 'dentex-production-routing-'));
const html = '<!doctype html><html><body>Dentex routing fixture</body></html>';
let server: ChildProcess;
let base: string;
beforeAll(async () => {
  mkdirSync(join(folder, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(folder, 'dist', 'index.html'), html);
  writeFileSync(join(folder, 'dist', 'assets', 'built.js'), 'console.log("built asset");');
  const entry = pathToFileURL(resolve('server/app.ts')).href;
  const loader = pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href;
  server = spawn(process.execPath, ['--import', loader, '--input-type=module', '-e',
    `const {app}=await import(${JSON.stringify(entry)});const server=app.listen(0,'127.0.0.1',()=>console.log(server.address().port));`], {
    cwd: folder, env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'synthetic-routing-test-secret-at-least-32', APP_ORIGIN: 'http://routing.example.test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise<string>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(Error('Production HTTP fixture did not start')), 10000);
    server.once('exit', () => { clearTimeout(timer); reject(Error('Production HTTP fixture exited')); });
    server.stdout!.once('data', (data: Buffer) => { clearTimeout(timer); resolveReady(`http://127.0.0.1:${data.toString().trim()}`); });
  });
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((done) => server.once('exit', () => done()));
    server.kill();
    await exited;
  }
  rmSync(folder, { recursive: true, force: true });
});

it('serves the application when a browser directly opens a patient URL', async () => {
  const response = await fetch(`${base}/clinic/patients/80bf1bd1-5180-4ba9-9da3-4fc2e29a369c`, { headers: { Accept: 'text/html' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(await response.text()).toBe(html);
});

it.each(['/assets/missing.js', '/assets/missing', '/assets', '/.env', '/clinic/.private', '/favicon.ico', '/%2eenv', '/%61ssets/missing', '/clinic/%2eprivate'])('does not disguise a missing static resource %s as the application', async (path) => {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  expect(response.status).toBe(404);
  expect(await response.text()).not.toBe(html);
});

it.each(['/', '/clinic', '/clinic/login', '/clinic/account', '/clinic/patients', '/clinic/patients/new', '/clinic/employees', '/clinic/roles', '/platform', '/platform/login', '/platform/clinics', '/platform/account', '/unknown-page'])('serves browser navigation to %s so the client can resolve access or absence', async (path) => {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(html);
});

it('supports HEAD for a deep page without returning a body', async () => {
  const response = await fetch(`${base}/clinic/patients/new`, { method: 'HEAD', headers: { Accept: 'text/html' } });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(html));
  expect(await response.text()).toBe('');
});

it('serves an existing built asset with its own content and media type', async () => {
  const response = await fetch(`${base}/assets/built.js`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/javascript/);
  expect(await response.text()).toBe('console.log("built asset");');
});

it('does not treat a JSON data request to a UI path as browser navigation', async () => {
  const response = await fetch(`${base}/clinic/patients`, { headers: { Accept: 'application/json' } });
  expect(response.status).toBe(404);
  expect(await response.text()).not.toBe(html);
});

it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('does not turn a %s to a UI path into a successful page', async (method) => {
  const response = await fetch(`${base}/clinic/patients/new`, { method, headers: { Accept: 'text/html' } });
  expect(response.status).toBe(404);
  expect(await response.text()).not.toBe(html);
});

it.each([
  ['/api/unknown', 'GET', 401, 'unauthorized'],
  ['/api', 'GET', 401, 'unauthorized'],
  ['/api/clinics', 'GET', 401, 'unauthorized'],
  ['/api/clinic/patients', 'GET', 401, 'unauthorized'],
  ['/api/auth/me', 'GET', 401, 'unauthorized'],
  ['/api/auth/logout', 'POST', 403, 'untrusted_origin'],
] as const)('preserves %s %s data errors even when HTML is accepted', async (path, method, status, error) => {
  const response = await fetch(`${base}${path}`, { method, headers: { Accept: 'text/html' } });
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({ error });
});

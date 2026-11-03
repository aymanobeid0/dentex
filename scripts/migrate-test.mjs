import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const { DATABASE_URL } = dotenv.parse(readFileSync(process.argv[2] || '.env'));
if (!DATABASE_URL) throw Error('DATABASE_URL is required in the provided environment file');
const url = new URL(DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Only a local test database is allowed');
url.pathname = '/dentex_test';
// Explicitly override any development URL inherited by the child process.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);

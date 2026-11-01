import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const passwords = [process.env.CLINIC_ADMIN_PASSWORD, process.env.PLATFORM_ADMIN_PASSWORD];
if (passwords.some(p => !p)) throw new Error('Set CLINIC_ADMIN_PASSWORD and PLATFORM_ADMIN_PASSWORD for this process.');
const hash = p => {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(p, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
};
const quote = value => "'" + value.replaceAll("'", "''") + "'";
function query(sql) {
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'database', 'psql', '-U', 'dentex', '-d', 'dentex_dev', '-v', 'ON_ERROR_STOP=1', '-At'], { cwd, input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Database operation failed. Ensure the local database is healthy.');
  return result.stdout;
}
query(readFileSync(new URL('../database/bootstrap.sql', import.meta.url), 'utf8'));
query(`BEGIN;
INSERT INTO clinics(name,code) VALUES ('arabisque','1234') ON CONFLICT(code) DO NOTHING;
INSERT INTO roles(clinic_id,key) SELECT id,k FROM clinics CROSS JOIN (VALUES ('admin'),('dentist'),('receptionist')) AS keys(k) WHERE code='1234' ON CONFLICT DO NOTHING;
INSERT INTO platform_admins(username,email,password_hash) VALUES ('ayman2','ayman2@gmail.com',${quote(hash(passwords[1]))}) ON CONFLICT(username) DO NOTHING;
INSERT INTO users(clinic_id,name,username,email,password_hash) SELECT id,'ayman','ayman','ayman@gmail.com',${quote(hash(passwords[0]))} FROM clinics WHERE code='1234' ON CONFLICT(clinic_id,username) DO NOTHING;
INSERT INTO user_roles(clinic_id,user_id,role_id) SELECT u.clinic_id,u.id,r.id FROM users u JOIN clinics c ON c.id=u.clinic_id JOIN roles r ON r.clinic_id=c.id AND r.key='admin' WHERE c.code='1234' AND u.username='ayman' ON CONFLICT DO NOTHING;
COMMIT;`);
const lines = query("SELECT password_hash FROM users u JOIN clinics c ON c.id=u.clinic_id WHERE c.code='1234' AND username='ayman'; SELECT password_hash FROM platform_admins WHERE username='ayman2';").trim().split(/\r?\n/);
if (lines.length !== 2) throw new Error('Expected two accounts.');
lines.forEach((stored, i) => {
  const [algorithm, n, r, p, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt') throw new Error('Unexpected password format.');
  const actual = scryptSync(passwords[i], salt, 64, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new Error('Existing account password differs; no existing password was overwritten.');
});
console.log('Verified: arabisque (1234), clinic admin ayman, platform admin ayman2. Both password hashes verified.');

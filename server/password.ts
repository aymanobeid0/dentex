import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callbackScrypt) as (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, hex] = stored.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hex || '')) return false;
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}

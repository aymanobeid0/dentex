import { expect, it, vi } from 'vitest';
import { createPlatformAuthService as createAuthService } from '../server/modules/auth/auth.service';
import type { AuthRepository, PlatformAccount } from '../server/modules/auth/auth.dto';
import { platformLoginSchema } from '../server/modules/auth/auth.schemas';

const account: PlatformAccount = { id: 'platform-id', username: 'admin', active: true, credentialVersion: 2, passwordHash: 'private-hash' };
const repository = (value: PlatformAccount | null): AuthRepository => ({
  findPlatformByUsername: async () => value,
  findPlatformById: async () => value,
  lockPlatform: async () => {},
});

it('returns only the public session and rejects stale credentials', async () => {
  const service = createAuthService(repository(account), async () => true);
  expect(await service.loginPlatform({ username: 'admin', password: 'secret' })).toEqual({
    platformId: account.id, credentialVersion: 2, identity: { kind: 'platform', username: 'admin' },
  });
  await expect(service.authenticatePlatform(account.id, 1)).rejects.toThrow('unauthorized');
  expect(await service.authenticatePlatform(account.id, 2)).not.toHaveProperty('passwordHash');
});

it('rejects missing, disabled and incorrect credentials with the same error', async () => {
  for (const value of [null, { ...account, active: false }, account]) {
    const service = createAuthService(repository(value), vi.fn(async () => false));
    await expect(service.loginPlatform({ username: 'admin', password: 'wrong' })).rejects.toThrow('invalid_credentials');
  }
});

it('preserves raw-length validation, whitespace normalization and permissive empty login fields', () => {
  expect(platformLoginSchema.parse({ username: ' admin ', password: '' })).toEqual({ username: 'admin', password: '' });
  expect(platformLoginSchema.safeParse({ username: ' '.repeat(201), password: '' }).success).toBe(false);
  expect(platformLoginSchema.safeParse({ username: '', password: 'x'.repeat(1025) }).success).toBe(false);
});

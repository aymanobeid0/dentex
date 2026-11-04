import './ui-browser-apis';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../client/main';

const account = (name = 'First user', clinic = 'one') => ({ kind: 'clinic', username: name, name, clinic: { id: clinic, name: `Clinic ${clinic}`, code: '2000' }, roles: ['dentist'], permissions: [] });
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  localStorage.setItem('dentex-lang', 'fr');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); window.location.hash = ''; });

it('refreshes the displayed identity while visible and online', async () => {
  let name = 'First user';
  vi.stubGlobal('fetch', vi.fn(async () => response(account(name))));
  vi.useFakeTimers();
  render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(screen.getAllByText('First user', { selector: 'p' }).length).toBe(2);
  name = 'Updated user';
  await act(async () => { await vi.advanceTimersByTimeAsync(15050); });
  expect(screen.getAllByText('Updated user', { selector: 'p' }).length).toBe(2);
});

function fillLogin() {
  fireEvent.change(screen.getByLabelText('Code du cabinet'), { target: { value: '2000' } });
  fireEvent.change(screen.getByLabelText('Nom d’utilisateur'), { target: { value: 'second' } });
  fireEvent.change(screen.getByLabelText(/Mot de passe/, { selector: 'input' }), { target: { value: 'test-only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

it('does not expose a previous clinic after logout, a second login, and late JSON', async () => {
  window.location.hash = '#patients';
  let finishBody!: (body: unknown) => void;
  let oldSignal: AbortSignal | null | undefined;
  const first = { ...account(), permissions: ['patients.read'] };
  let current = first;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/auth/me') return response(current);
    if (url.endsWith('/login')) { current = { ...account('Second user', 'two'), permissions: ['patients.read'] }; return response(current); }
    if (url === '/api/auth/logout') return response(null, 204);
    oldSignal = options?.signal;
    return { ok: true, status: 200, json: () => new Promise(resolve => { finishBody = resolve; }) };
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await waitFor(() => expect(finishBody).toBeTypeOf('function'));
  const oldBody = finishBody;
  const signal = oldSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
  await screen.findByLabelText('Code du cabinet');
  expect(signal?.aborted).toBe(true);
  fillLogin();
  await screen.findByRole('button', { name: 'Se déconnecter' });
  await act(async () => oldBody({ items: [{ id: 'old', name: 'PRIVATE OLD PATIENT', fileNumber: '123', phone: '+22212345678', isChild: false }], page: 1, hasNext: false }));
  expect(screen.queryByText('PRIVATE OLD PATIENT')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Mon compte' }));
  expect(await screen.findByText('Clinic two')).toBeTruthy();
  expect(screen.queryByText('Clinic one')).toBeNull();
  expect(Object.keys(localStorage)).toEqual(['dentex-lang']);
});

it('expires the shared session from an unmigrated screen without retrying its 401', async () => {
  window.location.hash = '#patients';
  const fetcher = vi.fn(async (url: string) => response(url === '/api/auth/me' ? { ...account(), permissions: ['patients.read'] } : null, url === '/api/auth/me' ? 200 : 401));
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  await screen.findByLabelText('Code du cabinet');
  expect(screen.queryByText('Clinic one')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.startsWith('/api/clinic/patients'))).toHaveLength(1);
});

it('keeps loaded identity with an offline warning and stops hidden/offline polling', async () => {
  let name = 'First user';
  const fetcher = vi.fn(async () => response(account(name)));
  vi.stubGlobal('fetch', fetcher);
  vi.useFakeTimers(); render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  const before = fetcher.mock.calls.length;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
  expect(fetcher.mock.calls.length).toBe(before);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  fireEvent(window, new Event('offline'));
  expect(screen.getByText(/les informations du compte peuvent être anciennes/)).toBeTruthy();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
  expect(fetcher.mock.calls.length).toBe(before);
  expect(screen.getAllByText('First user', { selector: 'p' })).toHaveLength(2);
  name = 'Reconnected user';
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  fireEvent(window, new Event('online'));
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  expect(screen.getAllByText('Reconnected user', { selector: 'p' })).toHaveLength(2);
});

it.each([401, 403, 409, 400])('does not retry a permanent identity rejection (%s)', async status => {
  const fetcher = vi.fn(async () => response(null, status));
  vi.stubGlobal('fetch', fetcher); vi.useFakeTimers(); render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Clinic one')).toBeNull();
});

it('limits transient read retries and recovers the displayed account', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(null, 503)).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(response(account()));
  vi.stubGlobal('fetch', fetcher); vi.useFakeTimers(); render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
  expect(screen.getByText('Clinic one')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('shows an uncertain login result without success, retry, or a queued write on reconnect', async () => {
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/login')) { writes++; throw new TypeError('lost response'); }
    return response(null, 401);
  }));
  render(<App />); await screen.findByLabelText('Code du cabinet');
  fillLogin();
  expect(await screen.findByText(/Résultat de la demande incertain/)).toBeTruthy();
  fireEvent(window, new Event('online'));
  expect(writes).toBe(1);
  expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'التغيير إلى اللغة العربية' }));
  expect(screen.getByRole('alert').textContent).toContain('تعذر التأكد');
  expect(document.documentElement.dir).toBe('rtl');
  expect(localStorage.getItem('dentex-lang')).toBe('ar');
});

it('shows unavailable identity rather than a login form when booting offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(screen.getByRole('alert').textContent).toContain('Connexion');
  expect(screen.queryByLabelText('Code du cabinet')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it('preserves an existing registration draft when identity polling changes an unrelated permission', async () => {
  window.location.hash = '#patients/new';
  let permissions = ['patients.write'];
  vi.stubGlobal('fetch', vi.fn(async () => response({ ...account(), permissions })));
  vi.useFakeTimers(); render(<App />);
  await act(async () => { await vi.advanceTimersByTimeAsync(50); });
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom complet' }), { target: { value: 'Unsaved draft' } });
  permissions = ['patients.write', 'invoices.read'];
  await act(async () => { await vi.advanceTimersByTimeAsync(15050); });
  expect((screen.getByRole('textbox', { name: 'Nom complet' }) as HTMLInputElement).value).toBe('Unsaved draft');
});

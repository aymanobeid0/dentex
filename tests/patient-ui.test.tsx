// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PatientPage } from '../client/PatientPage';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ''; });
it.each(['ar', 'fr'] as const)('registers with write permission alone without fetching patient details (%s)', async lang => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'patient-id', fileNumber: '1042' }) });
  vi.stubGlobal('fetch', fetcher);
  render(<PatientPage lang={lang} canRead={false} canWrite onExpired={() => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: lang === 'ar' ? 'الاسم الكامل' : 'Nom complet' }), { target: { value: 'مريم أحمد' } });
  fireEvent.change(screen.getByRole('textbox', { name: lang === 'ar' ? 'الهاتف' : 'Téléphone' }), { target: { value: '46108834' } });
  fireEvent.change(screen.getByRole('combobox', { name: lang === 'ar' ? 'الجنس' : 'Sexe' }), { target: { value: 'female' } });
  fireEvent.click(screen.getByRole('button', { name: lang === 'ar' ? 'تسجيل المريض' : 'Enregistrer le patient' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1042'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/clinic/patients');
});
it.each(['ar', 'fr'] as const)('opens a saved basic file with read permission alone (%s)', async lang => {
  window.location.hash = 'patients/saved-patient';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'saved-patient', fileNumber: '1042', name: 'مريم أحمد', phone: '+22246108834', gender: 'female', isChild: true, birthDate: null, address: null, administrativeNote: 'اتصال مساءً' }) }));
  const { container } = render(<PatientPage lang={lang} canRead canWrite={false} onExpired={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'مريم أحمد' })).toBeTruthy();
  expect(screen.getByText('+22246108834').getAttribute('dir')).toBe('ltr');
  expect(container.querySelector('section')?.getAttribute('dir')).toBe(lang === 'ar' ? 'rtl' : 'ltr');
  expect(screen.queryByRole('button', { name: /Enregistrer|تسجيل المريض/ })).toBeNull();
});
it('prevents duplicate submissions and preserves entered fields after a conflict', async () => {
  let finish!: (value: object) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  render(<PatientPage lang="fr" canRead canWrite onExpired={() => {}} />);
  const name = screen.getByRole('textbox', { name: 'Nom complet' }), phone = screen.getByRole('textbox', { name: 'Téléphone' });
  fireEvent.change(name, { target: { value: 'Patient' } }); fireEvent.change(phone, { target: { value: '46108834' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'male' } });
  const button = screen.getByRole('button', { name: 'Enregistrer le patient' });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetcher).toHaveBeenCalledTimes(1); expect((button as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: false, status: 409 });
  expect((await screen.findByRole('alert')).textContent).toContain('déjà utilisé');
  expect((name as HTMLInputElement).value).toBe('Patient');
  expect((phone as HTMLInputElement).value).toBe('46108834');
  await waitFor(() => expect(document.activeElement).toBe(phone));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enfant' }));
  expect(phone.getAttribute('aria-invalid')).toBe('false');
});
it.each([401, 403, 404, 500])('handles detail errors without exposing stale data (%s)', async status => {
  window.location.hash = 'patients/saved-patient'; const expired = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
  render(<PatientPage lang="fr" canRead canWrite={false} onExpired={expired} />);
  if (status === 401) await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  else expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('+22246108834')).toBeNull();
});
it.each(['ar', 'fr'] as const)('shows localized field validation and focuses the first invalid field (%s)', lang => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<PatientPage lang={lang} canRead canWrite onExpired={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: lang === 'ar' ? 'تسجيل المريض' : 'Enregistrer le patient' }));
  const name = screen.getByRole('textbox', { name: lang === 'ar' ? 'الاسم الكامل' : 'Nom complet' });
  expect(name.getAttribute('aria-invalid')).toBe('true'); expect(document.activeElement).toBe(name);
  expect(screen.getAllByText(lang === 'ar' ? 'هذا الحقل مطلوب.' : 'Ce champ est obligatoire.')).toHaveLength(3);
  expect(fetcher).not.toHaveBeenCalled();
});
it('distinguishes the server origin error code from missing permission', async () => {
  window.location.hash = 'patients/saved-patient';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'untrusted_origin' }) }));
  render(<PatientPage lang="fr" canRead canWrite={false} onExpired={() => {}} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Origine de la demande');
});

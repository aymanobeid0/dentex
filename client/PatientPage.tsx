import { useApi } from './api';
import { CheckField } from './ui/CheckField';
import { SelectField } from './ui/SelectField';
import { Label } from './ui/Label';
import { PatientList } from './PatientList';
import { translations, type Lang } from './locales';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, FileText, RefreshCw, Save, UserPlus, UserRound } from 'lucide-react';


type Form = { name: string; phone: string; gender: string; birthDate: string; address: string; administrativeNote: string; isChild: boolean };
type Patient = Omit<Form, 'birthDate' | 'address' | 'administrativeNote'> & { id: string; fileNumber: string; birthDate: string | null; address: string | null; administrativeNote: string | null };
type Failure = '' | 'denied' | 'missing' | 'network' | 'invalid' | 'duplicate' | 'failed' | 'origin';
type FieldFailure = 'requiredField' | 'invalidPhone' | 'invalidDate' | 'duplicate';
const responseFailure = async (response: Response): Promise<Failure> => {
  const codes: Record<string, Failure> = { forbidden: 'denied', untrusted_origin: 'origin', not_found: 'missing', invalid_input: 'invalid', duplicate_phone: 'duplicate' };
  try { const data = await response.json(); if (codes[data.error]) return codes[data.error]; } catch { /* Generic fallback for non-JSON failures. */ }
  return response.status === 403 ? 'denied' : response.status === 404 ? 'missing' : response.status === 409 ? 'duplicate' : response.status === 400 ? 'invalid' : 'failed';
};
const blank: Form = { name: '', phone: '', gender: '', birthDate: '', address: '', administrativeNote: '', isChild: false };
const selectedFile = () => window.location.hash === '#patients/new' ? '' : /^#patients\/([^/]+)$/.exec(window.location.hash)?.[1] ?? '';

export function PatientPage({ lang, canRead, canWrite, onExpired }: { lang: Lang; canRead: boolean; canWrite: boolean; onExpired: () => void }) {
  const fetch = useApi();
  const t = translations[lang].patients;
  const [creating, setCreating] = useState(() => window.location.hash === '#patients/new' || (!canRead && canWrite));
  const [id, setId] = useState(selectedFile), [form, setForm] = useState<Form>(blank);
  const [patient, setPatient] = useState<Patient | null>(null), [receipt, setReceipt] = useState('');
  const [error, setError] = useState<Failure>(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [reload, setReload] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, FieldFailure>>>({});
  const submitting = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const expired = useRef(onExpired); expired.current = onExpired;
  useEffect(() => { const changed = () => { setId(selectedFile()); setCreating(window.location.hash === '#patients/new'); setError(''); setReceipt(''); }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  useEffect(() => {
    setPatient(null); setError('');
    if (!id || !canRead) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/clinic/patients/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return;
      if (response.status === 401) { expired.current(); return; }
      if (!response.ok) { const failure = await responseFailure(response); if (!controller.signal.aborted) setError(failure); return; }
      const data: Patient = await response.json();
      if (!controller.signal.aborted) setPatient(data);
    }).catch(() => { if (!controller.signal.aborted) setError('network'); }).finally(() => { if (!controller.signal.aborted) { setLoading(false); heading.current?.focus(); } });
    return () => controller.abort();
  }, [id, canRead, reload]);
  useEffect(() => { if (!busy && fieldErrors.phone === 'duplicate') document.getElementById('patient-phone')?.focus(); }, [busy, fieldErrors.phone]);
  function newPatient() { window.location.hash = 'patients/new'; setCreating(true); setId(''); setPatient(null); setForm(blank); setFieldErrors({}); setReceipt(''); setError(''); heading.current?.focus(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current || !canWrite) return;
    const errors: Partial<Record<keyof Form, FieldFailure>> = {};
    if (!form.name.trim()) errors.name = 'requiredField';
    const phone = form.phone.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/[\s-]/g, '');
    if (!/^(?:(?:\+222|00222))?\d{8}$/.test(phone)) errors.phone = form.phone ? 'invalidPhone' : 'requiredField';
    if (!form.gender) errors.gender = 'requiredField';
    if (form.birthDate) {
      const date = new Date(`${form.birthDate}T00:00:00.000Z`);
      if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== form.birthDate || form.birthDate > new Date().toISOString().slice(0, 10) || form.birthDate < '0001-01-01') errors.birthDate = 'invalidDate';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) { document.getElementById(`patient-${Object.keys(errors)[0]}`)?.focus(); return; }
    submitting.current = true; setBusy(true); setError(''); setReceipt('');
    try {
      const response = await fetch('/api/clinic/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, birthDate: form.birthDate || null }) });
      if (response.status === 401) { expired.current(); return; }
      if (!response.ok) { const failure = await responseFailure(response); setError(failure); if (failure === 'duplicate') { setFieldErrors({ phone: 'duplicate' }); } return; }
      const created: { id: string; fileNumber: string } = await response.json();
      setForm(blank); setFieldErrors({});
      if (canRead) { window.location.hash = `patients/${created.id}`; setId(created.id); }
      else setReceipt(created.fileNumber);
    } catch { setError('network'); } finally { submitting.current = false; setBusy(false); }
  }
  function changeField<Key extends keyof Form>(key: Key, value: Form[Key]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: undefined, ...(key === 'isChild' && previous.phone === 'duplicate' ? { phone: undefined } : {}) }));
    setError('');
  }
  const field = (key: 'name' | 'phone' | 'birthDate' | 'address') => <Label className="field" htmlFor={`patient-${key}`}><span id={`patient-${key}-label`}>{t[key]} <small aria-hidden="true">{key === 'name' || key === 'phone' ? '*' : `(${t.optional})`}</small></span><span className="input-shell"><input id={`patient-${key}`} aria-labelledby={`patient-${key}-label`} type={key === 'birthDate' ? 'date' : key === 'phone' ? 'tel' : 'text'} dir={key === 'phone' || key === 'birthDate' ? 'ltr' : undefined} required={key === 'name' || key === 'phone'} maxLength={key === 'name' ? 200 : key === 'phone' ? 80 : key === 'address' ? 500 : undefined} max={key === 'birthDate' ? new Date().toISOString().slice(0, 10) : undefined} value={form[key]} onChange={event => changeField(key, event.target.value)} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `patient-${key}-error` : key === 'phone' ? 'patient-phone-hint' : undefined}/></span>{fieldErrors[key] && <small className="field-error" id={`patient-${key}-error`}>{t[fieldErrors[key]!]}</small>}{key === 'phone' && <small id="patient-phone-hint" className="patient-hint">{t.phoneHint}</small>}</Label>;
  return <section className="patients-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <div className="content-heading"><h1 ref={heading} tabIndex={-1}>{id ? t.file : t.title}</h1>{canWrite && !creating && <button className="language" onClick={newPatient}><UserPlus size={16} aria-hidden/>{t.new}</button>}</div>
    {receipt && <p className="success" role="status">{t.saved} <bdi>{receipt}</bdi></p>}
    {error && <div className="error" role="alert"><p>{t[error]}</p>{id && error !== 'denied' && error !== 'missing' && <button className="language" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden/>{t.retry}</button>}</div>}
    {id ? !canRead ? <p role="alert">{t.denied}</p> : loading ? <p role="status">{t.loading}</p> : patient && <article className="card patient-file"><header className="patient-identity"><span className="patient-avatar"><UserRound size={24} aria-hidden/></span><div><h2>{patient.name}</h2><span>{t.number}: <bdi>{patient.fileNumber}</bdi>{patient.isChild && <> · <span className="patient-child">{t.child}</span></>}</span></div></header><dl className="patient-data">{(['phone', 'gender', 'birthDate', 'address', 'administrativeNote', 'isChild'] as const).map(key => <div key={key}><dt>{key === 'isChild' ? t.child : t[key]}</dt><dd>{key === 'phone' ? <bdi dir="ltr">{patient.phone}</bdi> : key === 'gender' ? t[patient.gender === 'male' ? 'male' : 'female'] : key === 'isChild' ? t[patient.isChild ? 'yes' : 'no'] : key === 'birthDate' && patient.birthDate ? <bdi>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MR-u-nu-latn' : 'fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(patient.birthDate + 'T00:00:00.000Z'))}</bdi> : patient[key] || t.none}</dd></div>)}</dl></article>
    : canRead && !creating ? <PatientList lang={lang} onExpired={onExpired}/> : canWrite ? <section className="card patient-form"><h2><UserPlus size={18} aria-hidden/>{t.new}</h2><p className="patient-hint">* {t.required}</p><form onSubmit={submit} noValidate><fieldset disabled={busy} className="patient-fields"><div className="patient-grid">{field('name')}{field('phone')}<Label className="field" htmlFor="patient-gender"><span id="patient-gender-label">{t.gender} <small aria-hidden="true">*</small></span><SelectField id="patient-gender" labelledBy="patient-gender-label" direction={lang === 'ar' ? 'rtl' : 'ltr'} invalid={!!fieldErrors.gender} describedBy={fieldErrors.gender ? 'patient-gender-error' : undefined} required disabled={busy} value={form.gender} onValueChange={value => changeField('gender', value)} placeholder={t.choose} options={[{value:'male',label:t.male},{value:'female',label:t.female}]}/>{fieldErrors.gender && <small className="field-error" id="patient-gender-error">{t[fieldErrors.gender]}</small>}</Label>{field('birthDate')}{field('address')}</div><CheckField className="patient-check" checked={form.isChild} disabled={busy} onCheckedChange={checked => changeField('isChild', checked)}>{t.child}</CheckField><p className="patient-hint">{t.childHint}</p><Label className="field" htmlFor="patient-note"><span>{t.administrativeNote} <small>({t.optional})</small></span><textarea id="patient-note" maxLength={2000} rows={3} value={form.administrativeNote} onChange={event => changeField('administrativeNote', event.target.value)}/></Label><button className="primary action" disabled={busy}><Save size={16} aria-hidden/>{t.register}</button></fieldset></form></section> : <div className="card patient-empty"><FileText size={24} aria-hidden/><p>{canRead ? t.empty : t.denied}</p></div>}
    {canRead && (id || creating) && <button className="language patient-back" onClick={() => { window.location.hash = 'patients'; setId(''); setCreating(false); setError(''); }}><ArrowLeft size={16} className="directional" aria-hidden/>{t.backToList}</button>}
    {id && canWrite && <button className="language patient-back" onClick={newPatient}><ArrowLeft size={16} className="directional" aria-hidden/>{t.back}</button>}
  </section>;
}

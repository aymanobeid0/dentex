import { Disclosure, DisclosureTrigger } from './ui/Disclosure';
import { UiProvider } from './ui/UiProvider';
import { PasswordVisibility } from './ui/PasswordVisibility';
import { Label } from './ui/Label';
import { translations, type Lang } from './locales';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LanguageProvider, useLanguage } from './LanguageProvider';
import { Session, SessionProvider, useIdentity } from './session';
import { ApiError, useApi } from './api';
import { loginFailure } from './login-errors';
import { AppSidebar, type Page } from './AppSidebar';
import { EmployeePage } from './EmployeePage';
import { RolePermissionsPage } from './RolePermissionsPage';
import { AccountPassword } from './AccountPassword';
import { ClinicAdmins } from './ClinicAdmins';
import { PatientPage } from './PatientPage';
import { ArrowRight, Building2, Globe, LockKeyhole, LogOut, Menu, Plus, Save, X, UserRound, UsersRound } from 'lucide-react';
import '../design-tokens.css';
import './style.css';


type Clinic = { id:string; name:string; code:string };

type ClinicForm = { name:string; code:string; managerName:string; managerUsername:string; managerPassword:string };
const blankClinic: ClinicForm = { name:'', code:'', managerName:'', managerUsername:'', managerPassword:'' };
export function App() {
  const [session, setSession] = useState(() => new Session(next => setSession(next)));
  const [passwordChanged, setPasswordChanged] = useState(false);
  return <LanguageProvider><SessionProvider session={session}><SessionApp key={session.id} session={session} passwordChanged={passwordChanged} setPasswordChanged={setPasswordChanged}/></SessionProvider></LanguageProvider>;
}
function SessionApp({ session, passwordChanged, setPasswordChanged }: { session: Session; passwordChanged: boolean; setPasswordChanged: (value: boolean) => void }) {
  const { lang, setLang } = useLanguage();
  const { account, boot, stale, failed } = useIdentity(session);
  const fetch = useApi();
  const expire = () => session.replace(null);
  const [adminClinic, setAdminClinic] = useState<Clinic | null>(null);
  const [busy, setBusy] = useState(false), [show, setShow] = useState(false), [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches), [page, setPage] = useState<Page>('clinics');
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [loginCode, setLoginCode] = useState(''), [loginKind, setLoginKind] = useState<'clinic'|'platform'>('clinic');
  const [error, setError] = useState(''), [clinics, setClinics] = useState<Clinic[] | null>(null), [loadError, setLoadError] = useState(false);
  const t = translations[lang].app;
  const [creating, setCreating] = useState(false), [clinicForm, setClinicForm] = useState<ClinicForm>(blankClinic), [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ClinicForm, 'required'|'codeInvalid'|'duplicate'>>>({}), [createError, setCreateError] = useState(''), [created, setCreated] = useState(false);
  async function createClinic(e:FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<keyof ClinicForm, 'required'|'codeInvalid'|'duplicate'>> = {};
    for (const key of Object.keys(clinicForm) as (keyof ClinicForm)[]) if (!clinicForm[key].trim()) errors[key] = 'required';
    if (clinicForm.code && !/^[0-9]{4}$/.test(clinicForm.code)) errors.code = 'codeInvalid';
    setFieldErrors(errors); setCreateError('');
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/clinics', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(clinicForm) });
      if (r.status === 401) { expire(); return; }
      if (r.status === 409) { setFieldErrors({code:'duplicate'}); return; }
      if (!r.ok) { setCreateError('createError'); return; }
      setClinicForm(blankClinic); setCreating(false); setCreated(true); await loadClinics();
    } catch { setCreateError('network'); } finally { setBusy(false); }
  }
  function clinicField(key:keyof ClinicForm, label:string) {
    const errorKey = fieldErrors[key];
    return <Label className="field"><span>{label}</span><span className="input-shell"><input type={key==='managerPassword'?'password':'text'} dir={key==='code'?'ltr':undefined} inputMode={key==='code'?'numeric':undefined} maxLength={key==='code'?4:key==='managerPassword'?1024:200} autoComplete={key==='managerPassword'?'new-password':'off'} value={clinicForm[key]} onChange={e=>{setClinicForm({...clinicForm,[key]:e.target.value}); setFieldErrors({...fieldErrors,[key]:undefined});}} aria-invalid={!!errorKey} aria-describedby={errorKey?`${key}-error`:undefined}/></span>{errorKey&&<small className="field-error" id={`${key}-error`}>{t[errorKey]}</small>}</Label>;
  }
  useEffect(() => {
    const openPatientLink = () => { if (account?.kind === 'clinic' && window.location.hash.startsWith('#patients')) setPage('patients'); };
    window.addEventListener('hashchange', openPatientLink);
    return () => window.removeEventListener('hashchange', openPatientLink);
  }, [account?.kind]);
  async function loadClinics() { setLoadError(false); setClinics(null); try { const r = await fetch('/api/clinics'); if (r.status === 401) { expire(); return; } if (!r.ok) throw Error(); setClinics(await r.json()); } catch { setLoadError(true); } }
  useEffect(() => { if (account?.kind === 'platform') { setPage('clinics'); void loadClinics(); } else if (account?.kind === 'clinic') setPage(window.location.hash.startsWith('#patients') ? 'patients' : 'account'); }, [account?.kind]);
  async function refreshIdentity() { await session.refresh(); }
  async function login(e:FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const r=await fetch(`/api/auth/${loginKind}/login`,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(loginKind==='clinic'?{code:loginCode,username,password}:{username,password}) }); if (!r.ok) { setError(loginFailure(r.status)); return; } session.replace(await r.json()); setPassword(''); setPasswordChanged(false); } catch (error) { setError(error instanceof ApiError && error.kind === 'uncertain' ? 'uncertain' : 'network'); } finally { setBusy(false); } }
  async function logout() { setBusy(true); try { const r=await fetch('/api/auth/logout',{method:'POST'}); if (!r.ok) throw Error(); expire(); setClinics(null); setAdminClinic(null); } catch (error) { setError(error instanceof ApiError && error.kind === 'uncertain' ? 'uncertain' : 'network'); } finally { setBusy(false); } }
  const canReadPatients = account?.kind === 'clinic' && (account.roles.includes('admin') || account.permissions.includes('patients.read'));
  const canWritePatients = account?.kind === 'clinic' && (account.roles.includes('admin') || account.permissions.includes('patients.write'));
  useEffect(() => {
    if (account?.kind !== 'clinic') return;
    if (page === 'employees' && !account.roles.includes('admin') && !account.permissions.includes('employees.manage') || page === 'rolePermissions' && !account.roles.includes('admin') || page === 'patients' && !canReadPatients && !canWritePatients) setPage('account');
  }, [account, page, canReadPatients, canWritePatients]);
  const patientsLabel = t.patients;
  const language = <button type="button" className="language" aria-label={t.lang} onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}><Globe size={16} aria-hidden="true"/>{t.switchLanguage}</button>;
  const frame = (content: ReactNode) => <UiProvider direction={lang === 'ar' ? 'rtl' : 'ltr'}>{content}</UiProvider>;
  if ((failed || stale) && !account) return frame(<main className="login">{language}<p role="alert">{t.network}</p><button className="language" onClick={() => void session.refresh().catch(() => {})}>{t.retry}</button></main>);
  if (boot) return <p className="boot" role="status">{t.loading}</p>;
  if (!account) return frame(<div className="login-page"><main className="login"><header className="top"><div className="brand"><strong aria-hidden="true">D</strong>Dentex</div>{language}</header><div className="login-body"><h1>{loginKind==='clinic'?t.clinicTitle:t.title}</h1><p className="lead">{loginKind==='clinic'?t.clinicLead:t.lead}</p><form onSubmit={login}>{passwordChanged&&<p className="success" role="status">{t.passwordChanged}</p>}{loginKind==='clinic'&&<Label className="field"><span>{t.code}</span><span className="input-shell"><Building2 size={16} aria-hidden="true"/><input dir="ltr" className="clinic-code" value={loginCode} onChange={e=>setLoginCode(e.target.value)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required /></span></Label>}<Label className="field"><span>{t.user}</span><span className="input-shell"><UserRound size={16} aria-hidden="true"/><input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required /></span></Label><Label className="field"><span>{t.password}</span><span className="input-shell"><LockKeyhole size={16} aria-hidden="true"/><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><PasswordVisibility shown={show} onShownChange={setShow} showLabel={t.show} hideLabel={t.hide}/></span></Label><button className="primary" disabled={busy}>{t.login}<ArrowRight size={16} className="directional" aria-hidden="true"/></button><p className="error" role="alert">{error ? t[error as 'network'|'invalid'|'limit'|'origin'|'server'|'uncertain'] : ''}</p></form><button type="button" className="login-switch" onClick={()=>{setLoginKind(loginKind==='clinic'?'platform':'clinic');setPassword('');setError('');}}>{loginKind==='clinic'?t.toPlatform:t.toClinic}</button></div><footer>Dentex · {t.dashboard}</footer></main><aside className="visual"><div><h2>{loginKind==='clinic'?t.clinicIntro:t.intro}</h2><p>{loginKind==='clinic'?t.clinicDescription:t.description}</p><div className="visual-card"><Building2 size={20} aria-hidden="true"/><strong>{t.dashboard}</strong><p>{loginKind==='clinic'?t.clinicDescription:t.description}</p></div></div></aside></div>);
  return frame(<Disclosure open={!collapsed} onOpenChange={open=>setCollapsed(!open)} asChild><div className={'shell'+(collapsed?' collapsed':'')}><AppSidebar collapsed={collapsed} page={page} onNavigate={next=>{setPage(next);if(window.matchMedia('(max-width: 760px)').matches)setCollapsed(true)}} kind={account.kind} canManageEmployees={account.kind==='clinic'&&(account.roles.includes('admin')||account.permissions.includes('employees.manage'))} isAdmin={account.kind==='clinic'&&account.roles.includes('admin')} canAccessPatients={canReadPatients||canWritePatients} patientsLabel={patientsLabel} labels={t}/><div className="workspace"><header className="navbar"><span className="navbar-title"><DisclosureTrigger asChild><button className="icon mobile-menu" aria-label={collapsed?t.open:t.close}><Menu size={18} aria-hidden="true"/></button></DisclosureTrigger>{page==='patients'?patientsLabel:page==='rolePermissions'?t.rolePermissions:page==='employees'?t.employees:account.kind==='platform'&&page==='clinics'?t.dashboard:t.account}</span><div>{language}<button className="language" onClick={logout} disabled={busy}><LogOut size={16} aria-hidden="true"/>{t.logout}</button></div></header><main className="content">{page!=='patients'&&page!=='employees'&&page!=='rolePermissions'&&!adminClinic&&<div className="content-heading"><h1>{account.kind==='platform'&&page==='clinics'?t.dashboard:t.account}</h1>{account.kind==='platform'&&page==='clinics'&&!creating&&<button className="primary action" onClick={()=>{setCreating(true);setCreated(false);}}><Plus size={16} aria-hidden="true"/>{t.create}</button>}</div>}{stale&&<p role="status" className="error">{t.staleIdentity}</p>}{error&&<p className="error" role="alert">{error==='uncertain'?t.uncertain:t.network}</p>}{page==='patients'&&account.kind==='clinic'&&(canReadPatients||canWritePatients)?<PatientPage lang={lang} canRead={canReadPatients} canWrite={canWritePatients} onExpired={()=>expire()}/>:adminClinic&&account.kind==='platform'&&page==='clinics'?<ClinicAdmins clinic={adminClinic} lang={lang} onBack={()=>setAdminClinic(null)} onExpired={()=>{expire();setAdminClinic(null)}}/>:page==='rolePermissions'&&account.kind==='clinic'&&account.roles.includes('admin')?<RolePermissionsPage lang={lang} onExpired={()=>expire()}/>:page==='employees'&&account.kind==='clinic'&&(account.roles.includes('admin')||account.permissions.includes('employees.manage'))?<EmployeePage canManageAdmins={account.roles.includes('admin')} lang={lang} onExpired={()=>expire()} onIdentityChanged={refreshIdentity}/>: (account.kind==='clinic'||page==='account')?<><section className="card account-card">{account.kind==='clinic'&&<><div><span>{t.name}</span><p>{account.clinic.name}</p></div><div><span>{t.fullName}</span><p>{account.name}</p></div></>}<div><span>{t.user}</span><p>{account.username}</p></div>{account.kind==='clinic'&&<div><span>{t.roles}</span><p>{account.roles.map(role=>t[role as 'admin'|'dentist'|'receptionist']??role).join(t.roleSeparator)}</p></div>}</section>{account.kind==='clinic'&&<AccountPassword lang={lang} onExpired={()=>expire()} onChanged={()=>{expire();setPasswordChanged(true);setError('')}}/>}</>:creating?<section className="card clinic-form"><h2>{t.create}</h2><form onSubmit={createClinic} noValidate>{clinicField('name',t.name)}{clinicField('code',t.code)}{clinicField('managerName',t.managerName)}{clinicField('managerUsername',t.managerUsername)}{clinicField('managerPassword',t.managerPassword)}{createError&&<p role="alert" className="error">{t[createError as 'network'|'createError']}</p>}<div className="form-actions"><button className="primary action" disabled={busy}><Save size={16} aria-hidden="true"/>{t.save}</button><button type="button" className="language" disabled={busy} onClick={()=>{setCreating(false);setClinicForm(blankClinic);setFieldErrors({});setCreateError('');}}><X size={16} aria-hidden="true"/>{t.cancel}</button></div></form></section>:<><p role="status" className="success">{created?t.created:''}</p><section className="card">{loadError?<div role="alert">{t.network} <button className="language" onClick={loadClinics}>{t.retry}</button></div>:clinics===null?<p role="status">{t.loading}</p>:clinics.length===0?<p>{t.empty}</p>:<div className="table-scroll"><table><thead><tr><th>{t.name}</th><th>{t.code}</th><th></th></tr></thead><tbody>{clinics.map(c=><tr key={c.id}><td>{c.name}</td><td><bdi>{c.code}</bdi></td><td><button className="language" onClick={()=>setAdminClinic(c)}><UsersRound size={15} aria-hidden="true"/>{t.manageAdmins}</button></td></tr>)}</tbody></table></div>}</section></>}</main></div></div></Disclosure>);
}

import { translations, type Lang } from './locales';
import { useState, type FormEvent } from 'react';
import { KeyRound, Save, X } from 'lucide-react';


export function AccountPassword({lang,onExpired,onChanged}:{lang:Lang;onExpired:()=>void;onChanged:()=>void}) {
  const t=translations[lang].accountPassword; const [open,setOpen]=useState(false),[current,setCurrent]=useState(''),[next,setNext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<keyof typeof t|null>(null);
  async function submit(e:FormEvent){
    e.preventDefault(); setError(null);
    if(!current||!next.trim()){setError('required');return;} setBusy(true);
    try {const r=await fetch('/api/clinic/account/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:next})});
      if(r.status===401){onExpired();return;} if(!r.ok){const data=await r.json().catch(()=>({}));setError(data.error==='incorrect_password'?'incorrect':'error');return;}
      setCurrent('');setNext('');onChanged();
    } catch {setError('error')} finally {setBusy(false)}
  }
  return <section className="card clinic-form account-password">{!open?<button className="language" onClick={()=>setOpen(true)}><KeyRound size={16} aria-hidden="true"/>{t.title}</button>:<><h2>{t.title}</h2><form onSubmit={submit}><label className="field"><span>{t.current}</span><span className="input-shell"><input type="password" autoComplete="current-password" maxLength={1024} value={current} onChange={e=>setCurrent(e.target.value)}/></span></label><label className="field"><span>{t.next}</span><span className="input-shell"><input type="password" autoComplete="new-password" maxLength={1024} value={next} onChange={e=>setNext(e.target.value)}/></span></label>{error&&<p role="alert" className="error">{t[error]}</p>}<div className="form-actions"><button className="primary action" disabled={busy}><Save size={16} aria-hidden="true"/>{t.save}</button><button type="button" className="language" disabled={busy} onClick={()=>{setOpen(false);setCurrent('');setNext('');setError(null)}}><X size={16} aria-hidden="true"/>{t.cancel}</button></div></form></>}</section>;
}

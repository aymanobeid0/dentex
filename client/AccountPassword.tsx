import { useApi } from './api';
import { Disclosure, DisclosureContent, DisclosureTrigger } from './ui/Disclosure';
import { Label } from './ui/Label';
import { translations, type Lang } from './locales';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Save, X } from 'lucide-react';


export function AccountPassword({lang,onExpired,onChanged}:{lang:Lang;onExpired:()=>void;onChanged:()=>void}) {
  const fetch = useApi();
  const t=translations[lang].accountPassword; const [open,setOpen]=useState(false),[current,setCurrent]=useState(''),[next,setNext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<keyof typeof t|null>(null);
  const trigger = useRef<HTMLButtonElement>(null), currentInput = useRef<HTMLInputElement>(null), wasOpen = useRef(false);
  useEffect(() => { if (open) currentInput.current?.focus(); else if (wasOpen.current) trigger.current?.focus(); wasOpen.current = open; }, [open]);
  async function submit(e:FormEvent){
    e.preventDefault(); setError(null);
    if(!current||!next.trim()){setError('required');return;} setBusy(true);
    try {const r=await fetch('/api/clinic/account/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:current,newPassword:next})});
      if(r.status===401){onExpired();return;} if(!r.ok){const data=await r.json().catch(()=>({}));setError(data.error==='incorrect_password'?'incorrect':'error');return;}
      setCurrent('');setNext('');onChanged();
    } catch {setError('error')} finally {setBusy(false)}
  }
  return <Disclosure open={open} onOpenChange={setOpen} asChild><section className="card clinic-form account-password"><DisclosureTrigger asChild><button ref={trigger} className="language" hidden={open}><KeyRound size={16} aria-hidden="true"/>{t.title}</button></DisclosureTrigger><DisclosureContent><h2>{t.title}</h2><form onSubmit={submit}><Label className="field"><span>{t.current}</span><span className="input-shell"><input ref={currentInput} type="password" autoComplete="current-password" maxLength={1024} value={current} onChange={e=>setCurrent(e.target.value)}/></span></Label><Label className="field"><span>{t.next}</span><span className="input-shell"><input type="password" autoComplete="new-password" maxLength={1024} value={next} onChange={e=>setNext(e.target.value)}/></span></Label>{error&&<p role="alert" className="error">{t[error]}</p>}<div className="form-actions"><button className="primary action" disabled={busy}><Save size={16} aria-hidden="true"/>{t.save}</button><button type="button" className="language" disabled={busy} onClick={()=>{setOpen(false);setCurrent('');setNext('');setError(null)}}><X size={16} aria-hidden="true"/>{t.cancel}</button></div></form></DisclosureContent></section></Disclosure>;
}

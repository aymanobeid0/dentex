import { useApi } from './api';
import { CheckField } from './ui/CheckField';
import { Label } from './ui/Label';
import { translations, type Lang } from './locales';
import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, Save, UserCheck, UserX, X } from 'lucide-react';

type Role={id:string;key:string};
type Employee={id:string;name:string;username:string;active:boolean;roles:Role[]};
type Draft={name:string;username:string;password:string;roleIds:string[]};

const blank=():Draft=>({name:'',username:'',password:'',roleIds:[]});

export function EmployeePage({lang,onExpired,onIdentityChanged,canManageAdmins}:{lang:Lang;onExpired:()=>void;onIdentityChanged:()=>Promise<void>;canManageAdmins:boolean}) {
  const fetch = useApi();
  const t=translations[lang].employees;
  const [list,setList]=useState<Employee[]|null>(null), [roles,setRoles]=useState<Role[]>([]), [loadError,setLoadError]=useState(false);
  const [editing,setEditing]=useState<Employee|null|undefined>(undefined), [draft,setDraft]=useState<Draft>(blank), [error,setError]=useState<keyof typeof t|null>(null), [saved,setSaved]=useState(false), [busy,setBusy]=useState(false);
  const l=translations[lang].employeeLifecycle;
  const [action,setAction]=useState<{kind:'status'|'reset';employee:Employee}|null>(null), [newPassword,setNewPassword]=useState(''), [actionError,setActionError]=useState<keyof typeof t|'requiredPassword'|null>(null), [notice,setNotice]=useState<'statusSaved'|'resetSaved'|null>(null);
  const roleName=(role:Role)=>t[role.key as 'admin'|'dentist'|'receptionist']??role.key;
  async function load(){
    setLoadError(false);setList(null);
    try { const [employeesResponse,rolesResponse]=await Promise.all([fetch('/api/clinic/employees'),fetch('/api/clinic/roles')]);
      if(employeesResponse.status===401||rolesResponse.status===401){onExpired();return;}
      if(!employeesResponse.ok||!rolesResponse.ok){setLoadError(true);return;}
      setList(await employeesResponse.json());setRoles(await rolesResponse.json());
    } catch {setLoadError(true);}
  }
  useEffect(()=>{void load()},[]);
  function open(employee:Employee|null){setEditing(employee);setDraft(employee?{name:employee.name,username:employee.username,password:'',roleIds:employee.roles.map(r=>r.id)}:blank());setError(null);setSaved(false)}
  async function submit(e:FormEvent){
    e.preventDefault();setError(null);
    if(!draft.name.trim()||!draft.username.trim()||(!editing&&!draft.password.trim())||!draft.roleIds.length){setError('required');return}
    setBusy(true);
    try {
      const body=editing?{name:draft.name,username:draft.username,roleIds:draft.roleIds}:draft;
      const response=await fetch(editing?`/api/clinic/employees/${editing.id}`:'/api/clinic/employees',{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(response.status===401){onExpired();return}
      if(!response.ok){const data=await response.json().catch(()=>({})); setError(data.error==='duplicate_username'?'duplicate':data.error==='last_admin'?'lastAdmin':data.error==='invalid_roles'?'invalidRoles':response.status===403?'forbidden':'error');return}
      setEditing(undefined);setDraft(blank());setSaved(true);await onIdentityChanged();await load();
    } catch {setError('error')} finally {setBusy(false)}
  }
  async function submitAction(e:FormEvent){
    e.preventDefault(); if(!action)return; setActionError(null);
    if(action.kind==='reset'&&!newPassword.trim()){setActionError('requiredPassword');return;}
    setBusy(true);
    try {
      const status=action.kind==='status';
      const response=await fetch(`/api/clinic/employees/${action.employee.id}/${status?'status':'reset-password'}`,{method:status?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(status?{active:!action.employee.active}:{password:newPassword})});
      if(response.status===401){onExpired();return;}
      if(!response.ok){const data=await response.json().catch(()=>({}));setActionError(data.error==='last_admin'?'lastAdmin':response.status===403?'forbidden':'error');return;}
      setAction(null);setNewPassword('');setNotice(status?'statusSaved':'resetSaved'); await onIdentityChanged(); await load();
    } catch {setActionError('error');} finally {setBusy(false);}
  }
  return <>
    <div className="employee-heading"><h1>{t.title}</h1>{editing===undefined&&!action&&<button className="primary action" disabled={list===null||loadError} onClick={()=>open(null)}><Plus size={16} aria-hidden="true"/>{t.add}</button>}</div>
    {action?<section className="card clinic-form"><h2>{action.kind==='status'?(action.employee.active?l.disable:l.enable):l.reset}</h2><p>{action.employee.name}</p><form onSubmit={submitAction}>{action.kind==='status'?<p>{action.employee.active?l.confirmDisable:l.confirmEnable}</p>:<Label className="field"><span>{l.newPassword}</span><span className="input-shell"><input type="password" autoComplete="new-password" maxLength={1024} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></span></Label>}{actionError&&<p role="alert" className="error">{actionError==='requiredPassword'?l.required:t[actionError]}</p>}<div className="form-actions"><button className="primary action" disabled={busy}><Save size={16} aria-hidden="true"/>{l.confirm}</button><button type="button" className="language" disabled={busy} onClick={()=>{setAction(null);setNewPassword('');setActionError(null)}}><X size={16} aria-hidden="true"/>{t.cancel}</button></div></form></section>:editing!==undefined?<section className="card clinic-form"><h2>{editing?t.edit:t.add}</h2><form onSubmit={submit} noValidate>
      <Label className="field"><span>{t.name}</span><span className="input-shell"><input maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></span></Label>
      <Label className="field"><span>{t.username}</span><span className="input-shell"><input maxLength={200} autoComplete="off" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></span></Label>
      {!editing&&<Label className="field"><span>{t.password}</span><span className="input-shell"><input type="password" maxLength={1024} autoComplete="new-password" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></span></Label>}
      <fieldset className="role-options"><legend>{t.roles}</legend>{roles.map(role=><CheckField key={role.id} disabled={!canManageAdmins&&role.key==='admin'} checked={draft.roleIds.includes(role.id)} onCheckedChange={checked=>setDraft({...draft,roleIds:checked?[...draft.roleIds,role.id]:draft.roleIds.filter(id=>id!==role.id)})}>{roleName(role)}</CheckField>)}</fieldset>
      {error&&<p className="error" role="alert">{t[error]}</p>}
      <div className="form-actions"><button className="primary action" disabled={busy}><Save size={16} aria-hidden="true"/>{t.save}</button><button type="button" className="language" disabled={busy} onClick={()=>{setEditing(undefined);setDraft(blank());setError(null)}}><X size={16} aria-hidden="true"/>{t.cancel}</button></div>
    </form></section>:<><p className="success" role="status">{notice?l[notice]:saved?t.saved:''}</p><section className="card">{loadError?<div role="alert">{t.error} <button className="language" onClick={load}>{t.retry}</button></div>:list===null?<p role="status">{t.loading}</p>:!list.length?<p>{t.empty}</p>:<div className="table-scroll"><table><thead><tr><th>{t.name}</th><th>{t.username}</th><th>{t.roles}</th><th>{t.status}</th><th></th></tr></thead><tbody>{list.map(employee=><tr key={employee.id}><td>{employee.name}</td><td><bdi>{employee.username}</bdi></td><td>{employee.roles.map(roleName).join(t.roleSeparator)}</td><td>{employee.active?t.active:t.inactive}</td><td><div className="form-actions"><button className="language" onClick={()=>{setNotice(null);open(employee)}}><Pencil size={15} aria-hidden="true"/>{t.edit}</button>{(canManageAdmins||!employee.roles.some(role=>role.key==='admin'))&&<><button className="language" onClick={()=>{setNotice(null);setAction({kind:'status',employee})}}>{employee.active?<UserX size={15} aria-hidden="true"/>:<UserCheck size={15} aria-hidden="true"/>}{employee.active?l.disable:l.enable}</button><button className="language" onClick={()=>{setNotice(null);setAction({kind:'reset',employee})}}><KeyRound size={15} aria-hidden="true"/>{l.reset}</button></>}</div></td></tr>)}</tbody></table></div>}</section></>}
  </>;
}

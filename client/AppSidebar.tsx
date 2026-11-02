import { Building2, Menu, PanelLeftClose, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
export type Page='clinics'|'account'|'employees'|'rolePermissions';
type Labels={dashboard:string;employees:string;rolePermissions:string;account:string;open:string;close:string};
type Props={collapsed:boolean;onToggle:()=>void;page:Page;onNavigate:(page:Page)=>void;kind:'clinic'|'platform';canManageEmployees:boolean;isAdmin:boolean;labels:Labels};
export function AppSidebar({collapsed,onToggle,page,onNavigate,kind,canManageEmployees,isAdmin,labels:t}:Props){
 return <aside className="sidebar"><div className="sidebar-head"><div className="brand"><strong aria-hidden="true">D</strong>{!collapsed&&'Dentex'}</div><button className="icon" aria-label={collapsed?t.open:t.close} aria-expanded={!collapsed} onClick={onToggle}>{collapsed?<Menu size={18} aria-hidden="true"/>:<PanelLeftClose size={18} className="directional" aria-hidden="true"/>}</button></div><nav aria-label={t.dashboard}>
  {kind==='platform'&&<button className={'nav-item '+(page==='clinics'?'selected':'')} title={t.dashboard} aria-label={t.dashboard} onClick={()=>onNavigate('clinics')}><Building2 size={18} aria-hidden="true"/>{!collapsed&&t.dashboard}</button>}
  {kind==='clinic'&&canManageEmployees&&<button className={'nav-item '+(page==='employees'?'selected':'')} title={t.employees} aria-label={t.employees} onClick={()=>onNavigate('employees')}><UsersRound size={18} aria-hidden="true"/>{!collapsed&&t.employees}</button>}
  {kind==='clinic'&&isAdmin&&<button className={'nav-item '+(page==='rolePermissions'?'selected':'')} title={t.rolePermissions} aria-label={t.rolePermissions} onClick={()=>onNavigate('rolePermissions')}><ShieldCheck size={18} aria-hidden="true"/>{!collapsed&&t.rolePermissions}</button>}
  <button className={'nav-item '+(page==='account'?'selected':'')} title={t.account} aria-label={t.account} onClick={()=>onNavigate('account')}><UserRound size={18} aria-hidden="true"/>{!collapsed&&t.account}</button>
 </nav></aside>;
}

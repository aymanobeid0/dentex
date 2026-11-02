// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {AppSidebar} from '../client/AppSidebar';
afterEach(cleanup);
it('keeps navigation names when collapsed and mirrors the collapse icon in RTL',()=>{
 const labels={dashboard:'العيادات',employees:'الموظفون',rolePermissions:'الأدوار والصلاحيات',account:'حسابي',open:'فتح القائمة',close:'طي القائمة'};
 const {rerender}=render(<AppSidebar collapsed page="employees" onToggle={vi.fn()} onNavigate={vi.fn()} kind="clinic" canManageEmployees isAdmin labels={labels}/>);
 expect(screen.getByRole('button',{name:'الموظفون'}).getAttribute('aria-label')).toBe('الموظفون');
 expect(screen.getByRole('button',{name:'الأدوار والصلاحيات'}).getAttribute('aria-label')).toBe('الأدوار والصلاحيات');
 rerender(<AppSidebar collapsed={false} page="employees" onToggle={vi.fn()} onNavigate={vi.fn()} kind="clinic" canManageEmployees isAdmin labels={labels}/>);
 expect(screen.getByRole('button',{name:'طي القائمة'}).querySelector('.directional')).toBeTruthy();
});

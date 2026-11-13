import {
  Building2,
  CalendarDays,
  House,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { DisclosureContent, DisclosureTrigger } from "../../ui/Disclosure";
import { Hint } from "../../ui/Hint";
import type { Page } from "../navigation";
type Labels = {
  home: string;
  appointments: string;
  dashboard: string;
  employees: string;
  rolePermissions: string;
  account: string;
  open: string;
  close: string;
};
type Props = {
  collapsed: boolean;
  page: Page | null;
  onNavigate: (page: Page) => void;
  kind: "clinic" | "platform";
  canManageEmployees: boolean;
  isAdmin: boolean;
  canAccessPatients?: boolean;
  canAccessAppointments?: boolean;
  patientsLabel?: string;
  labels: Labels;
};
export function AppSidebar({
  collapsed,
  page,
  onNavigate,
  kind,
  canManageEmployees,
  isAdmin,
  canAccessPatients,
  canAccessAppointments,
  patientsLabel,
  labels: t,
}: Props) {
  const items = [
    {
      page: "appointments" as const,
      visible: kind === "clinic" && canAccessAppointments,
      label: t.appointments,
      Icon: CalendarDays,
    },
    {
      page: "home" as const,
      visible: kind === "clinic",
      label: t.home,
      Icon: House,
    },
    {
      page: "clinics" as const,
      visible: kind === "platform",
      label: t.dashboard,
      Icon: Building2,
    },
    {
      page: "employees" as const,
      visible: kind === "clinic" && canManageEmployees,
      label: t.employees,
      Icon: UsersRound,
    },
    {
      page: "rolePermissions" as const,
      visible: kind === "clinic" && isAdmin,
      label: t.rolePermissions,
      Icon: ShieldCheck,
    },
    {
      page: "patients" as const,
      visible: kind === "clinic" && canAccessPatients,
      label: patientsLabel ?? "",
      Icon: Users,
    },
    {
      page: "account" as const,
      visible: true,
      label: t.account,
      Icon: UserRound,
    },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <strong aria-hidden="true">D</strong>
          {!collapsed && "Dentex"}
        </div>
        <DisclosureTrigger asChild>
          <button className="icon" aria-label={collapsed ? t.open : t.close}>
            {collapsed ? (
              <Menu size={18} aria-hidden />
            ) : (
              <PanelLeftClose size={18} className="directional" aria-hidden />
            )}
          </button>
        </DisclosureTrigger>
      </div>
      <DisclosureContent forceMount asChild>
        <nav aria-label={t.dashboard}>
          {items
            .filter((item) => item.visible)
            .map(({ page: target, label, Icon }) => (
              <Hint key={target} text={label} enabled={collapsed}>
                <button
                  className={"nav-item " + (page === target ? "selected" : "")}
                  aria-label={label}
                  aria-current={page === target ? "page" : undefined}
                  onClick={() => onNavigate(target)}
                >
                  <Icon size={18} aria-hidden />
                  {!collapsed && label}
                </button>
              </Hint>
            ))}
        </nav>
      </DisclosureContent>
    </aside>
  );
}

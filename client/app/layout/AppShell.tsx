import { IconButton } from "../../ui/IconButton";
import { LogOut, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { LanguageSwitch, translations, type Lang } from "../../shared/i18n";
import { Disclosure, DisclosureTrigger } from "../../ui/Disclosure";
import type { Page } from "../navigation";
import { AppSidebar } from "./AppSidebar";
type Props = {
  lang: Lang;
  page: Page | null;
  onNavigate: (page: Page) => void;
  kind: "clinic" | "platform";
  canManageEmployees: boolean;
  isAdmin: boolean;
  canAccessPatients: boolean;
  canAccessAppointments?: boolean;
  busy: boolean;
  onLogout: () => void;
  children: ReactNode;
};
export function AppShell({
  lang,
  page,
  onNavigate,
  kind,
  canManageEmployees,
  isAdmin,
  canAccessPatients,
  canAccessAppointments,
  busy,
  onLogout,
  children,
}: Props) {
  const t = translations[lang].app;
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const title =
    page === "appointments"
      ? t.appointments
      : page === "home"
        ? t.home
        : page === "patients"
          ? t.patients
          : page === "rolePermissions"
            ? t.rolePermissions
            : page === "employees"
              ? t.employees
              : kind === "platform" && page === "clinics"
                ? t.dashboard
                : t.account;
  return (
    <Disclosure
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      asChild
    >
      <div className={"shell" + (collapsed ? " collapsed" : "")}>
        <AppSidebar
          collapsed={collapsed}
          page={page}
          onNavigate={(next) => {
            onNavigate(next);
            if (window.matchMedia("(max-width: 760px)").matches)
              setCollapsed(true);
          }}
          kind={kind}
          canManageEmployees={canManageEmployees}
          isAdmin={isAdmin}
          canAccessPatients={canAccessPatients}
          canAccessAppointments={canAccessAppointments}
          patientsLabel={t.patients}
          labels={t}
        />
        <div className="workspace">
          <header className="navbar">
            <span className="navbar-title">
              <DisclosureTrigger asChild>
                <button
                  className="icon mobile-menu"
                  aria-label={collapsed ? t.open : t.close}
                >
                  <Menu size={18} aria-hidden="true" />
                </button>
              </DisclosureTrigger>
              {title}
            </span>
            <div>
              <LanguageSwitch />
              <IconButton
                label={t.logout}
                tone="danger"
                onClick={onLogout}
                disabled={busy}
              >
                <LogOut size={16} aria-hidden="true" />
              </IconButton>
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </Disclosure>
  );
}

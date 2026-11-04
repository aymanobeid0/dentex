import { Disclosure } from "../../client/ui/Disclosure";
import "./ui-browser-apis";
import { UiProvider } from "../../client/ui/UiProvider";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppSidebar } from "../../client/app/layout/AppSidebar";
afterEach(cleanup);
it("keeps navigation names when collapsed and mirrors the collapse icon in RTL", () => {
  const labels = {
    dashboard: "العيادات",
    employees: "الموظفون",
    rolePermissions: "الأدوار والصلاحيات",
    account: "حسابي",
    open: "فتح القائمة",
    close: "طي القائمة",
  };
  const { rerender } = render(
    <AppSidebar
      collapsed
      page="employees"
      onNavigate={vi.fn()}
      kind="clinic"
      canManageEmployees
      isAdmin
      labels={labels}
    />,
    {
      wrapper: ({ children }) => (
        <UiProvider direction="rtl">
          <Disclosure>{children}</Disclosure>
        </UiProvider>
      ),
    },
  );
  expect(
    screen.getByRole("button", { name: "الموظفون" }).getAttribute("aria-label"),
  ).toBe("الموظفون");
  expect(
    screen
      .getByRole("button", { name: "الأدوار والصلاحيات" })
      .getAttribute("aria-label"),
  ).toBe("الأدوار والصلاحيات");
  rerender(
    <AppSidebar
      collapsed={false}
      page="employees"
      onNavigate={vi.fn()}
      kind="clinic"
      canManageEmployees
      isAdmin
      labels={labels}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "طي القائمة" })
      .querySelector(".directional"),
  ).toBeTruthy();
});

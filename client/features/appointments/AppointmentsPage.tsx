import { DateField } from "../../ui/DateTimeField";
import { useId, useRef, useState } from "react";
import { translations, type Lang } from "../../shared/i18n";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import type { NavigationGuard } from "../../ui/useDraftGuard";
import { BookingAction, BookingDialog } from "./BookingAction";
import type { PatientRegistrationSlot } from "./BookingAction";
import { AppointmentResults } from "./AppointmentResults";
import { useAppointmentDoctors, useAppointmentList } from "./queries";
import { statusKey } from "./AppointmentTable";
import type { DayFilter } from "./api";
import { ToggleGroup, ToggleGroupItem } from "../../ui/ToggleGroup";
import { IconButton } from "../../ui/IconButton";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  CalendarDays,
} from "lucide-react";
import { shiftPeriod, type CalendarView } from "./calendar";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "../../ui/Disclosure";

export type AppointmentsPageProps = {
  renderPatientRegistration?: PatientRegistrationSlot;
  canRegisterPatient?: boolean;
  lang: Lang;
  canRead: boolean;
  canWrite: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export function AppointmentsPage(props: AppointmentsPageProps) {
  const { lang, canRead, onExpired } = props,
    t = translations[lang].appointments,
    id = useId();
  const [filter, setFilter] = useState<DayFilter>(() => ({
    date: new Date().toISOString().slice(0, 10),
    doctorId: "",
    status: "",
    q: "",
    page: 1,
    view: "day",
  }));
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(null);
  const slotOpener = useRef<HTMLElement | null>(null);
  const [text, setText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [filter.doctorId, filter.status, filter.q].filter(
    Boolean,
  ).length;
  const doctors = useAppointmentDoctors(canRead, onExpired);
  const list = useAppointmentList(filter, canRead, onExpired);
  const options = new Map(
    (doctors.data || []).map((doctor) => [doctor.id, doctor.name]),
  );
  for (const row of list.data?.items || [])
    options.set(row.doctor.id, row.doctor.name);
  if (filter.doctorId && !options.has(filter.doctorId))
    options.set(filter.doctorId, filter.doctorId);
  const change = (values: Partial<DayFilter>) =>
    setFilter((previous) => ({ ...previous, ...values, page: 1 }));
  const periodLabel = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR",
    {
      month: "long",
      year: "numeric",
      ...(filter.view === "day"
        ? { day: "numeric" as const, weekday: "long" as const }
        : {}),
      calendar: "gregory",
      timeZone: "Africa/Nouakchott",
    },
  ).format(new Date(filter.date + "T00:00:00Z"));
  const controls = canRead ? (
    <Disclosure
      className="appointment-controls"
      open={filtersOpen}
      onOpenChange={setFiltersOpen}
    >
      <div className="appointment-period-toolbar">
        <div className="appointment-period-label">
          <h2 className="ui-period-title">{periodLabel}</h2>

          <div className="appointment-period-navigation">
            <IconButton
              label={t.previousPeriod}
              disabled={!shiftPeriod(filter.date, filter.view || "day", -1)}
              onClick={() => {
                const date = shiftPeriod(filter.date, filter.view || "day", -1);
                if (date) change({ date });
              }}
            >
              <ChevronLeft className="directional" size={16} aria-hidden />
            </IconButton>
            <button
              type="button"
              className="ui-button"
              aria-label={t.today}
              onClick={() =>
                change({ date: new Date().toISOString().slice(0, 10) })
              }
            >
              <CalendarDays size={15} aria-hidden />
              <span className="ui-text-desktop">{t.today}</span>
            </button>
            <IconButton
              label={t.nextPeriod}
              disabled={!shiftPeriod(filter.date, filter.view || "day", 1)}
              onClick={() => {
                const date = shiftPeriod(filter.date, filter.view || "day", 1);
                if (date) change({ date });
              }}
            >
              <ChevronRight className="directional" size={16} aria-hidden />
            </IconButton>
          </div>
        </div>
        <ToggleGroup
          type="single"
          value={filter.view || "day"}
          onValueChange={(value) => {
            if (value) {
              change({ view: value as CalendarView });
              setFiltersOpen(false);
            }
          }}
          dir={lang === "ar" ? "rtl" : "ltr"}
          className="ui-calendar-switch appointment-view-switch"
          aria-label={t.calendarView}
        >
          {(["day", "week", "month"] as const).map((view) => (
            <ToggleGroupItem
              className="ui-button ui-view-option"
              key={view}
              value={view}
            >
              {t[view]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <DisclosureTrigger asChild>
          <button
            className="ui-button appointment-filter-trigger"
            aria-label={t.filters}
            data-active={activeFilters > 0}
          >
            <SlidersHorizontal size={15} aria-hidden />
            <span>
              {t.filtersShort}
              {activeFilters > 0 ? " (" + activeFilters + ")" : ""}
            </span>
          </button>
        </DisclosureTrigger>
      </div>
      <DisclosureContent className="appointment-filter-content">
        <form
          className="appointment-filters ui-filter-panel"
          onSubmit={(event) => {
            event.preventDefault();
            change({ q: text.trim() });
            setFiltersOpen(false);
          }}
        >
          <div className="field">
            <Label htmlFor={`${id}-date`}>{t.date}</Label>
            <DateField
              id={`${id}-date`}
              label={t.date}
              lang={lang}
              value={filter.date}
              onValueChange={(date) => change({ date })}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-doctor`}>{t.doctor}</Label>
            <SelectField
              id={`${id}-doctor`}
              placeholder={t.allDoctors}
              value={filter.doctorId || "all"}
              onValueChange={(value) =>
                change({ doctorId: value === "all" ? "" : value })
              }
              direction={lang === "ar" ? "rtl" : "ltr"}
              options={[
                { value: "all", label: t.allDoctors },
                ...[...options].map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-status`}>{t.status}</Label>
            <SelectField
              id={`${id}-status`}
              placeholder={t.allStatuses}
              value={filter.status || "all"}
              onValueChange={(value) =>
                change({ status: value === "all" ? "" : value })
              }
              direction={lang === "ar" ? "rtl" : "ltr"}
              options={[
                { value: "all", label: t.allStatuses },
                ...Object.entries(statusKey).map(([value, key]) => ({
                  value,
                  label: t[key],
                })),
              ]}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-search`}>{t.patientSearch}</Label>
            <input
              className="ui-input"
              id={`${id}-search`}
              type="search"
              placeholder={t.patientSearch}
              maxLength={200}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="appointment-filter-actions">
            <button className="primary action">{t.search}</button>
            <button
              type="button"
              className="ui-button"
              onClick={() => {
                setText("");
                change({ q: "", doctorId: "", status: "" });
              }}
            >
              {t.resetFilters}
            </button>
          </div>
        </form>
      </DisclosureContent>
    </Disclosure>
  ) : null;
  return (
    <section dir={lang === "ar" ? "rtl" : "ltr"}>
      <h1 className="ui-sr-only">{t.pageTitle}</h1>
      <div className="appointment-board">
        <AppointmentResults
          filter={filter}
          lang={lang}
          canRead={canRead}
          canWrite={props.canWrite}
          onNavigationGuardChange={props.onNavigationGuardChange}
          onExpired={onExpired}
          onPage={(page) => setFilter((previous) => ({ ...previous, page }))}
          onDateChange={(date) => change({ date })}
          bookingAction={<BookingAction {...props} />}
          onBookSlot={
            props.canWrite
              ? (date, time) => {
                  slotOpener.current = document.activeElement as HTMLElement;
                  setSlot({ date, time });
                }
              : undefined
          }
          calendarHeader={controls}
          doctorChoices={[...options]
            .filter(([id]) => !filter.doctorId || id === filter.doctorId)
            .map(([id, name]) => ({ id, name }))}
        />
      </div>
      {slot && (
        <BookingDialog
          {...props}
          initialSchedule={slot}
          returnFocus={slotOpener}
          onClose={() => setSlot(null)}
        />
      )}
    </section>
  );
}

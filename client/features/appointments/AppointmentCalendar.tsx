import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CalendarDays, AlertTriangle } from "lucide-react";
import { translations, type Lang } from "../../shared/i18n";
import { Hint } from "../../ui/Hint";
import { Modal } from "../../ui/Modal";
import type { AppointmentRow } from "./api";
import {
  appointmentDate,
  appointmentTime,
  statusKey,
  statusTone,
} from "./AppointmentTable";
import { calendarDays } from "./calendar";

const minute = (value: string) =>
  Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
function weekLayout(items: AppointmentRow[]) {
  const sorted = [...items].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  );
  const clusters: AppointmentRow[][] = [];
  let until = -1;
  for (const item of sorted) {
    const start = minute(item.startsAt),
      duration = (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000;
    if (!clusters.length || start >= until) {
      clusters.push([]);
      until = -1;
    }
    clusters[clusters.length - 1].push(item);
    until = Math.max(until, start + Math.max(duration, 27));
  }
  return clusters.flatMap((cluster) => {
    const ends: number[] = [];
    const placed = cluster.map((item) => {
      const start = minute(item.startsAt),
        duration =
          (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000;
      let lane = ends.findIndex((end) => end <= start);
      if (lane === -1) lane = ends.length;
      ends[lane] = start + Math.max(duration, 27);
      return {
        item,
        lane,
        top: (start * 80) / 60,
        height: Math.max(36, (duration * 80) / 60),
      };
    });
    const lanes = Math.min(ends.length, 3),
      crowded = ends.length > 3;
    return placed.map((value) => ({
      ...value,
      lanes,
      hidden: crowded && value.lane >= 2,
      crowded,
      hiddenCount: placed.filter((item) => item.lane >= 2).length,
      clusterStart: (minute(cluster[0].startsAt) * 80) / 60,
      firstHidden: placed.find((item) => item.lane >= 2)?.item.id,
    }));
  });
}
function Event({
  item,
  lang,
  onOpen,
  compact = false,
}: {
  item: AppointmentRow;
  lang: Lang;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const t = translations[lang].appointments;
  const duration =
    (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000;
  const label = `${t.details}: ${item.patient.name} ${appointmentTime(item.startsAt, lang)}`;
  const hint = [
    `${appointmentTime(item.startsAt, lang)} – ${appointmentTime(item.endsAt, lang)}`,
    item.patient.name,
    `${t.fileNumber}: ${item.patient.fileNumber}`,
    item.doctor.name,
    t[statusKey[item.status]],
    item.patient.archived ? t.archivedWarning : "",
    !item.doctor.eligible ? t.doctorWarning : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Hint text={hint}>
      <button
        type="button"
        className="ui-calendar-event"
        data-size={compact ? "compact" : "timed"}
        data-density={
          duration >= 45 ? "full" : duration >= 30 ? "two-lines" : "one-line"
        }
        data-tone={statusTone[item.status]}
        data-cancelled={item.status === "cancelled"}
        aria-label={label}
        onClick={() => onOpen(item.id)}
      >
        {(compact || duration >= 30) && (
          <span className="ui-calendar-event-time">
            <bdi dir="ltr">
              {appointmentTime(item.startsAt, lang)}
              {!compact && ` – ${appointmentTime(item.endsAt, lang)}`}
            </bdi>
          </span>
        )}
        <span className="ui-calendar-event-name">{item.patient.name}</span>
        {!compact && duration >= 45 && (
          <span className="ui-calendar-event-meta">
            {item.doctor.name} · {item.patient.fileNumber} ·{" "}
            {t[statusKey[item.status]]}
          </span>
        )}
        {(item.patient.archived || !item.doctor.eligible) && (
          <AlertTriangle
            className="ui-calendar-event-warning"
            size={12}
            aria-hidden
          />
        )}
      </button>
    </Hint>
  );
}
export function AppointmentCalendar({
  date,
  view,
  items,
  lang,
  onOpen,
  bookingAction,
  header,
  doctorChoices,
  onDateChange,
  onBookSlot,
  emptyMessage,
  showGrid = true,
  dayPage,
}: {
  date: string;
  view: "day" | "week" | "month";
  items: AppointmentRow[];
  lang: Lang;
  onOpen: (id: string) => void;
  bookingAction?: ReactNode;
  header?: ReactNode;
  doctorChoices?: { id: string; name: string }[];
  onDateChange?: (date: string) => void;
  onBookSlot?: (date: string, time: string) => void;
  emptyMessage?: string;
  showGrid?: boolean;
  dayPage?: {
    page: number;
    total: number;
    hasNext: boolean;
    onChange: (page: number) => void;
  };
}) {
  const t = translations[lang].appointments,
    days = view === "day" ? [date] : calendarDays(date, view),
    today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState(date),
    [agendaOpen, setAgendaOpen] = useState(false),
    agendaOpener = useRef<HTMLElement | null>(null),
    timeline = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (view === "day" && showGrid && timeline.current) {
      const first = items.length
        ? Math.min(...items.map((item) => minute(item.startsAt)))
        : 9 * 60;
      timeline.current.scrollTop = Math.max(0, Math.floor(first / 60 - 1) * 80);
    }
  }, [date, view, showGrid]);
  useEffect(() => {
    setSelected(date);
  }, [date, view]);
  const weekday = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR",
    { weekday: "long", timeZone: "Africa/Nouakchott" },
  );
  const byDay = new Map<string, AppointmentRow[]>();
  for (const item of items) {
    const key = item.startsAt.slice(0, 10);
    const list = byDay.get(key) || [];
    list.push(item);
    byDay.set(key, list);
  }
  const columns =
    view === "day"
      ? [
          ...new Map([
            ...(doctorChoices || []).map(
              (doctor) => [doctor.id, doctor] as const,
            ),
            ...items.map((item) => [item.doctor.id, item.doctor] as const),
          ]).values(),
        ].map((doctor) => ({
          key: doctor.id,
          title: doctor.name,
          subtitle: "",
          items: items.filter((item) => item.doctor.id === doctor.id),
        }))
      : days.map((day) => ({
          key: day,
          title: weekday.format(new Date(day + "T00:00:00Z")),
          subtitle: appointmentDate(day, lang),
          items: byDay.get(day) || [],
        }));
  if (!columns.length)
    columns.push({
      key: date,
      title: t.noAppointments,
      subtitle: appointmentDate(date, lang),
      items: [],
    });
  const selectedItems = byDay.get(selected) || [];
  function choose(day: string, focus = false) {
    setSelected(day);
    if (focus) {
      agendaOpener.current = document.activeElement as HTMLElement;
      setAgendaOpen(true);
    }
  }
  const miniMonth = date.slice(0, 7);
  const grid = (
    <>
      {view !== "day" ? (
        <div
          className="ui-calendar-scroll"
          data-view={view}
          role="region"
          tabIndex={0}
          aria-label={view === "week" ? t.weekCalendar : t.monthCalendar}
        >
          <table className="ui-calendar-table appointment-month-table">
            <thead>
              <tr>
                {days.slice(0, 7).map((day) => (
                  <th scope="col" key={day}>
                    {weekday.format(new Date(day + "T00:00:00Z"))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, week) => (
                <tr key={week}>
                  {days.slice(week * 7, week * 7 + 7).map((day) => {
                    const inside =
                        view === "week" || day.slice(0, 7) === miniMonth,
                      bookings = inside ? byDay.get(day) || [] : [];
                    return (
                      <td
                        key={day}
                        data-outside={!inside}
                        data-selected={selected === day}
                      >
                        <div className="appointment-month-cell">
                          <div className="ui-calendar-cell-heading appointment-month-day-header">
                            <button
                              className={
                                view === "week"
                                  ? "ui-calendar-day ui-calendar-week-date"
                                  : "ui-calendar-day"
                              }
                              type="button"
                              data-today={day === today}
                              aria-label={appointmentDate(day, lang)}
                              aria-pressed={selected === day}
                              onClick={() =>
                                inside ? choose(day, true) : onDateChange?.(day)
                              }
                            >
                              <bdi>
                                {view === "week"
                                  ? appointmentDate(day, lang)
                                  : Number(day.split("-").at(-1))}
                              </bdi>
                            </button>
                          </div>
                          {inside && (
                            <button
                              type="button"
                              className="ui-calendar-count"
                              aria-haspopup="dialog"
                              aria-label={
                                t.total +
                                ": " +
                                bookings.length +
                                " · " +
                                appointmentDate(day, lang)
                              }
                              onClick={() => choose(day, true)}
                            >
                              <bdi>{bookings.length}</bdi>
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={timeline}
          className="ui-calendar-scroll ui-calendar-week-scroll"
          role="region"
          tabIndex={0}
          aria-label={view === "day" ? t.dayCalendar : t.weekCalendar}
        >
          <div
            className="appointment-week-grid"
            style={{
              gridTemplateColumns: `56px repeat(${columns.length}, minmax(${view === "day" ? 220 : 112}px,1fr))`,
              minWidth: view === "day" ? 280 : 840,
            }}
          >
            <div className="ui-week-heading" aria-hidden>
              {t.time}
            </div>
            {columns.map((column) => (
              <button
                type="button"
                key={column.key}
                className="ui-week-heading"
                aria-pressed={view !== "day" && selected === column.key}
                onClick={() => choose(view === "day" ? date : column.key, true)}
              >
                {column.title}
                {column.subtitle && (
                  <span>
                    <bdi>{column.subtitle}</bdi>
                  </span>
                )}
              </button>
            ))}
            <div className="appointment-week-axis">
              {Array.from({ length: 24 }, (_, hour) => (
                <button
                  type="button"
                  className="ui-week-hour ui-calendar-hour"
                  key={hour}
                  disabled={!onBookSlot}
                  aria-label={
                    t.bookAt + " " + String(hour).padStart(2, "0") + ":00"
                  }
                  onClick={() =>
                    onBookSlot?.(date, String(hour).padStart(2, "0") + ":00")
                  }
                >
                  <bdi>{String(hour).padStart(2, "0")}:00</bdi>
                </button>
              ))}
            </div>
            {columns.map((column) => (
              <div
                key={column.key}
                className="appointment-week-day-column"
                aria-label={column.title}
                data-selected={selected === column.key}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <button
                    type="button"
                    className="ui-week-rule ui-calendar-slot"
                    key={hour}
                    style={{ top: hour * 80 }}
                    disabled={!onBookSlot}
                    aria-label={
                      t.bookAt +
                      " " +
                      String(hour).padStart(2, "0") +
                      ":00 · " +
                      column.title
                    }
                    onClick={() =>
                      onBookSlot?.(date, String(hour).padStart(2, "0") + ":00")
                    }
                  />
                ))}
                {weekLayout(column.items).map((entry) =>
                  entry.hidden ? (
                    entry.firstHidden === entry.item.id && (
                      <button
                        type="button"
                        key={entry.item.id}
                        className="ui-calendar-cluster"
                        style={{
                          top: entry.clusterStart,
                          insetInlineStart: "66.666%",
                          width: "33.334%",
                        }}
                        aria-haspopup="dialog"
                        onClick={() =>
                          choose(view === "day" ? date : column.key, true)
                        }
                      >
                        +{entry.hiddenCount} {t.more}
                      </button>
                    )
                  ) : (
                    <div
                      className="appointment-timed-event"
                      key={entry.item.id}
                      style={{
                        top: entry.top,
                        height: entry.height,
                        insetInlineStart: `${(entry.lane * 100) / entry.lanes}%`,
                        width: `${100 / entry.lanes}%`,
                      }}
                    >
                      <Event item={entry.item} lang={lang} onOpen={onOpen} />
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="appointment-calendar-workspace">
      <div className="appointment-calendar-main">
        <div className="appointment-calendar-topbar">
          {header}
          <div className="appointment-calendar-booking">{bookingAction}</div>
        </div>
        <div className="appointment-day-layout" data-view={view}>
          <div className="appointment-day-timeline">
            {showGrid ? grid : <p role="status">{emptyMessage}</p>}
          </div>
          {view === "day" && (
            <aside
              className="appointment-day-summary"
              aria-label={t.dayAppointments}
            >
              <button
                type="button"
                className="ui-day-agenda-card"
                aria-label={t.viewDayAppointments}
                aria-haspopup="dialog"
                disabled={!showGrid || !items.length}
                onClick={() => choose(date, true)}
              >
                <span className="ui-day-agenda-heading">
                  <CalendarDays size={18} aria-hidden />
                  <strong>{t.dayAppointments}</strong>
                  <span className="badge badge-neutral">
                    {dayPage?.total ?? items.length}
                  </span>
                </span>
                <span className="ui-day-agenda-date">
                  <bdi>{appointmentDate(date, lang)}</bdi>
                </span>
                {showGrid && items.length ? (
                  <span className="ui-day-agenda-preview">
                    {items.slice(0, 4).map((item) => (
                      <span
                        className="ui-day-agenda-entry"
                        key={item.id}
                        data-tone={statusTone[item.status]}
                        data-cancelled={item.status === "cancelled"}
                      >
                        <bdi dir="ltr">
                          {appointmentTime(item.startsAt, lang)} –{" "}
                          {appointmentTime(item.endsAt, lang)}
                        </bdi>
                        <strong>{item.patient.name}</strong>
                        <span>{item.doctor.name}</span>
                        <span>{t[statusKey[item.status]]}</span>
                      </span>
                    ))}
                    <span className="ui-day-agenda-more">
                      {(dayPage?.total ?? items.length) > 4 && (
                        <span>
                          <bdi>+{(dayPage?.total ?? items.length) - 4}</bdi>{" "}
                          {t.remainingAppointments}
                        </span>
                      )}
                      <span>{t.viewDayAppointments}</span>
                    </span>
                  </span>
                ) : (
                  <span className="ui-calendar-empty">
                    {emptyMessage || t.noAppointments}
                  </span>
                )}
              </button>
            </aside>
          )}
        </div>
        {view === "day" && (
          <div className="ui-calendar-legend">
            {Object.entries(statusKey).map(([status, key]) => (
              <span key={status}>
                <i data-tone={statusTone[status as AppointmentRow["status"]]} />
                {t[key]}
              </span>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={agendaOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          agendaOpener.current?.focus();
        }}
        onOpenChange={(value) => {
          setAgendaOpen(value);
          if (!value)
            requestAnimationFrame(() => agendaOpener.current?.focus());
        }}
        trigger={<button hidden>{t.dayAppointments}</button>}
        title={t.dayAppointments}
        description={appointmentDate(selected, lang)}
        close={t.close}
        direction={lang === "ar" ? "rtl" : "ltr"}
        headerIcon={<CalendarDays size={18} aria-hidden />}
      >
        <div className="ui-dialog-body">
          <section
            className="ui-calendar-agenda"
            aria-label={t.dayAppointments}
          >
            <div className="ui-calendar-agenda-header">
              <h2>
                <bdi>{appointmentDate(selected, lang)}</bdi>
              </h2>
              <span className="badge badge-neutral">
                {selectedItems.length}
              </span>
            </div>
            {selectedItems.length === 0 ? (
              <p className="ui-calendar-empty">
                {emptyMessage || t.noAppointments}
              </p>
            ) : (
              <div className="ui-calendar-agenda-list">
                {selectedItems.map((item) => (
                  <button
                    type="button"
                    className="ui-calendar-visit"
                    key={item.id}
                    data-tone={statusTone[item.status]}
                    data-cancelled={item.status === "cancelled"}
                    onClick={() => onOpen(item.id)}
                    aria-label={`${t.details}: ${item.patient.name} ${appointmentTime(item.startsAt, lang)}`}
                  >
                    <bdi dir="ltr">{appointmentTime(item.startsAt, lang)}</bdi>
                    <span>
                      <strong>{item.patient.name}</strong>
                      <small>
                        {item.doctor.name} · {t.fileNumber}{" "}
                        {item.patient.fileNumber}
                      </small>
                      <small>
                        {t[statusKey[item.status]]}
                        {item.patient.archived && ` · ${t.archivedWarning}`}
                        {!item.doctor.eligible && ` · ${t.doctorWarning}`}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {view === "day" &&
            dayPage &&
            (dayPage.page > 1 || dayPage.hasNext) && (
              <nav
                className="appointment-pagination"
                aria-label={t.dayAppointments}
              >
                <button
                  className="ui-button"
                  disabled={dayPage.page === 1}
                  onClick={() => dayPage.onChange(dayPage.page - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {t.page} <bdi>{dayPage.page}</bdi>
                </span>
                <button
                  className="ui-button"
                  disabled={!dayPage.hasNext}
                  onClick={() => dayPage.onChange(dayPage.page + 1)}
                >
                  {t.next}
                </button>
              </nav>
            )}
        </div>
      </Modal>
    </div>
  );
}

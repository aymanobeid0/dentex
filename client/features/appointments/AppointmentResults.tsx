import { useRef, useState, type ReactNode } from "react";
import { translations, type Lang } from "../../shared/i18n";
import { useAppointmentList } from "./queries";
import { AppointmentTable } from "./AppointmentTable";
import { AppointmentDetails } from "./AppointmentDetails";
import type { DayFilter } from "./api";
import type { NavigationGuard } from "../../ui/useDraftGuard";
import { IconButton } from "../../ui/IconButton";
import { RefreshCw } from "lucide-react";
import { AppointmentCalendar } from "./AppointmentCalendar";

export function AppointmentResults({
  filter,
  lang,
  canRead,
  onPage,
  onExpired,
  canWrite = false,
  onNavigationGuardChange,
  showNoReadHint = true,
  bookingAction,
  calendarHeader,
  doctorChoices,
  onDateChange,
}: {
  filter: DayFilter | { patientId: string; page: number };
  lang: Lang;
  canRead: boolean;
  onPage: (page: number) => void;
  onExpired: () => void;
  canWrite?: boolean;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
  showNoReadHint?: boolean;
  bookingAction?: ReactNode;
  calendarHeader?: ReactNode;
  doctorChoices?: { id: string; name: string }[];
  onDateChange?: (date: string) => void;
}) {
  const t = translations[lang].appointments,
    query = useAppointmentList(filter, canRead, onExpired);
  const [detail, setDetail] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const calendar = "date" in filter ? filter.view || "day" : null;
  const open = (id: string) => {
    opener.current = document.activeElement as HTMLElement;
    setDetail(id);
  };
  const details = detail && (
    <AppointmentDetails
      id={detail}
      lang={lang}
      canRead={canRead}
      canWrite={canWrite}
      onExpired={onExpired}
      onNavigationGuardChange={onNavigationGuardChange}
      onClose={() => {
        setDetail("");
        requestAnimationFrame(() => opener.current?.focus());
      }}
    />
  );
  return (
    <>
      {!canRead && showNoReadHint && <p role="status">{t.createOnly}</p>}
      <div hidden={!canRead && !calendar}>
        {!query.online && <p role="status">{t.offline}</p>}
        {query.isPending && query.online && <p role="status">{t.loading}</p>}
        {query.isError && (
          <p role="alert">{query.blocked ? t.readDenied : t.failed}</p>
        )}
        {calendar && "date" in filter && (
          <AppointmentCalendar
            date={filter.date}
            view={calendar}
            items={query.data?.items || []}
            lang={lang}
            onOpen={open}
            bookingAction={bookingAction}
            header={calendarHeader}
            doctorChoices={doctorChoices}
            onDateChange={onDateChange}
            showGrid={!!query.data}
            emptyMessage={
              !canRead || query.blocked
                ? t.readDenied
                : !query.data
                  ? query.isError
                    ? t.failed
                    : t.loading
                  : undefined
            }
          />
        )}
        {query.data && !calendar && (
          <>
            <p role="status">
              {t.total}: <bdi>{query.data.total}</bdi>
            </p>
            {query.data.items.length === 0 && <p>{t.noAppointments}</p>}
            {!calendar && query.data.items.length > 0 && (
              <AppointmentTable
                items={query.data.items}
                lang={lang}
                showDate={"patientId" in filter}
                onOpen={open}
              />
            )}
          </>
        )}
        <div className="appointment-pagination" data-calendar={!!calendar}>
          {calendar === "day" && query.data && (
            <span className="ui-result-count" role="status">
              {t.total}: <bdi>{query.data.total}</bdi>
            </span>
          )}
          {(!calendar ||
            (calendar === "day" &&
              (filter.page > 1 || query.data?.hasNext))) && (
            <>
              <button
                className="ui-button"
                disabled={filter.page === 1}
                onClick={() => onPage(filter.page - 1)}
              >
                {t.previous}
              </button>
              <span>
                {t.page} <bdi>{filter.page}</bdi>
              </span>
              <button
                className="ui-button"
                disabled={!query.data?.hasNext}
                onClick={() => onPage(filter.page + 1)}
              >
                {t.next}
              </button>
            </>
          )}
          {calendar ? (
            <IconButton
              label={t.refresh}
              disabled={!query.online || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw size={15} aria-hidden />
            </IconButton>
          ) : (
            <button
              className="ui-button"
              disabled={!query.online || query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t.refresh}
            </button>
          )}
        </div>
      </div>
      {details}
    </>
  );
}

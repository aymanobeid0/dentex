import {
  AttendanceCorrections,
  CorrectionHistory,
} from "./AttendanceCorrections";
import { AppointmentLinkDialog } from "./AppointmentLinkDialog";
import { AppointmentReference } from "./AppointmentReference";
import type { Attendance } from "./api";
import type { NavigationGuard } from "../../ui/useDraftGuard";
import { useRef, useState } from "react";
import { translations, type Lang } from "../../shared/i18n";
import { usePatientHistory } from "./queries";
import { arrivalTime } from "./visits.format";
import {VisitTreatments} from "./VisitTreatments";

export function PatientVisits({
  patient,
  lang,
  canRead,
  canTreat=false,
  onExpired,
  onNavigationGuardChange,
}: {
  patient: { id: string; name: string; fileNumber: string; archived: boolean };
  lang: Lang;
  canRead: boolean;
  canTreat?:boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const [editing, setEditing] = useState<Attendance | null>(null),
    [saved, setSaved] = useState(false),
    returnFocus = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(1),
    t = translations[lang].visits;
  const query = usePatientHistory(patient.id, page, onExpired, canRead);
  if (!canRead) return null;
  return (
    <section
      className="card"
      dir={lang === "ar" ? "rtl" : "ltr"}
      aria-label={t.history}
    >
      {saved && <p role="status">{t.saved}</p>}
      {editing && (
        <AppointmentLinkDialog
          row={editing}
          lang={lang}
          onExpired={onExpired}
          onNavigationGuardChange={onNavigationGuardChange}
          returnFocus={returnFocus}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSaved(true);
          }}
        />
      )}
      <div className="content-heading">
        <h2>{t.history}</h2>
        <button
          className="ui-button"
          disabled={query.isFetching || !query.online}
          onClick={() => void query.refetch()}
        >
          {t.refresh}
        </button>
      </div>
      {!query.online && <p role="status">{t.offline}</p>}
      {query.isPending && query.online && <p role="status">{t.loading}</p>}
      {query.isError && (
        <p role="alert">{query.blocked ? t.readDenied : t.failed}</p>
      )}
      {query.data && !query.blocked && (
        <>
          {!query.data.items.length ? (
            <p>{t.historyEmpty}</p>
          ) : (
            <ol className="visits-list">
              {query.data.items.map((row) => (
                <li key={row.id}>
                  <div className="visits-person">
                    <strong>{row.doctor.name}</strong>
                    <CorrectionHistory row={row} lang={lang} />
                    <AppointmentReference row={row} lang={lang} />
                    <span>
                      {t.arrive}:{" "}
                      <time dateTime={row.arrivedAt}>
                        {arrivalTime(row.arrivedAt, lang)}
                      </time>
                    </span>
                    <span>
                      {row.status === "completed"
                        ? t.completed
                        : t.attendanceStatuses[row.status]}
                    </span>
                    {row.autoClosure && (
                      <>
                        <span>{t.autoClosureReason}</span>
                        <span>
                          {t.autoClosureEffective}:{" "}
                          <time dateTime={row.autoClosure.effectiveClosedAt}>
                            {arrivalTime(
                              row.autoClosure.effectiveClosedAt,
                              lang,
                            )}
                          </time>
                        </span>
                        <span>
                          {t.autoClosureRecorded}:{" "}
                          <time dateTime={row.autoClosure.recordedAt}>
                            {arrivalTime(row.autoClosure.recordedAt, lang)}
                          </time>
                        </span>
                      </>
                    )}
                    {row.visit && (
                      <span>
                        {t.entry}:{" "}
                        <time dateTime={row.visit.startedAt}>
                          {arrivalTime(row.visit.startedAt, lang)}
                        </time>
                      </span>
                    )}
                    {row.recordedEndAt && (
                      <span>
                        {t.endRecorded}:{" "}
                        <time dateTime={row.recordedEndAt}>
                          {arrivalTime(row.recordedEndAt, lang)}
                        </time>
                      </span>
                    )}
                  </div>
                  <div className="visits-actions">
                    {row.visit&&canTreat&&<VisitTreatments attendanceId={row.id} lang={lang} onExpired={onExpired} onNavigationGuardChange={onNavigationGuardChange}/>}
                    <AttendanceCorrections
                      row={row}
                      lang={lang}
                      onExpired={onExpired}
                      onNavigationGuardChange={onNavigationGuardChange}
                    />
                    {row.visit && (
                      <button
                        className="ui-button"
                        onClick={() => {
                          returnFocus.current =
                            document.activeElement as HTMLElement;
                          setSaved(false);
                          setEditing(row);
                        }}
                      >
                        {t.linkAppointment}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {(page > 1 || query.data.hasNext) && (
            <div className="visits-actions">
              <button
                className="ui-button"
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                {t.previous}
              </button>
              <span>
                {t.page} <bdi>{page}</bdi>
              </span>
              <button
                className="ui-button"
                disabled={!query.data.hasNext || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.next}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

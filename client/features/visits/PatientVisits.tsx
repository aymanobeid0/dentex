import { useState } from "react";
import { translations, type Lang } from "../../shared/i18n";
import { usePatientHistory } from "./queries";
import { arrivalTime } from "./VisitsPage";

export function PatientVisits({
  patient,
  lang,
  canRead,
  onExpired,
}: {
  patient: { id: string; name: string; fileNumber: string; archived: boolean };
  lang: Lang;
  canRead: boolean;
  onExpired: () => void;
}) {
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
            <p>{t.reviewEmpty}</p>
          ) : (
            <ol className="visits-list">
              {query.data.items.map((row) => (
                <li key={row.id}>
                  <div className="visits-person">
                    <strong>{row.doctor.name}</strong>
                    <span>
                      {t.arrive}:{" "}
                      <time dateTime={row.arrivedAt}>
                        {arrivalTime(row.arrivedAt, lang)}
                      </time>
                    </span>
                    <span>
                      {row.status === "waiting"
                        ? t.waiting
                        : row.status === "with_doctor"
                          ? t.withDoctor
                          : row.status === "completed"
                            ? t.completed
                            : t.leave}
                    </span>
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

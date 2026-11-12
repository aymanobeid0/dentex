import { nameInitials } from "../../../ui/nameInitials";
import { Hint } from "../../../ui/Hint";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import type { FormEvent } from "react";
import { translations, type Lang } from "../../../shared/i18n";
import { Label } from "../../../ui/Label";
import { SelectField } from "../../../ui/SelectField";
import { ScreenReaderStatus } from "../../../ui/ScreenReaderStatus";
import { usePatientSearch } from "../hooks/usePatientSearch";
import type { PatientView } from "../types";

export function PatientList({
  onNavigate,
  lang,
  onExpired,
}: {
  onNavigate: (view: PatientView) => void;
  lang: Lang;
  onExpired: () => void;
}) {
  const t = translations[lang].patients;
  const {
    draft,
    request,
    result,
    error,
    loading,
    change,
    clear,
    load,
    search,
    searchPending,
    stale,
    compositionStart,
    compositionEnd,
    changeStatus,
  } = usePatientSearch(onExpired);
  function submit(event: FormEvent) {
    event.preventDefault();
    search();
  }
  const status = loading
    ? result
      ? t.updating
      : t.listLoading
    : error || !result
      ? ""
      : t.resultsShown.replace("{count}", String(result.items.length));
  return (
    <section className="card patient-list" aria-label={t.title}>
      <div className="patient-toolbar">
        <form className="patient-search" role="search" onSubmit={submit}>
          <Label className="field" htmlFor="patient-search">
            <span>{t.searchLabel}</span>
            <span className="input-shell">
              <Search size={16} aria-hidden />
              <input
                id="patient-search"
                type="search"
                maxLength={200}
                value={draft}
                onChange={(event) => change(event.target.value)}
                onCompositionStart={compositionStart}
                onCompositionEnd={(event) =>
                  compositionEnd(event.currentTarget.value)
                }
              />
            </span>
          </Label>
          <button className="primary action" disabled={searchPending}>
            <Search size={16} aria-hidden />
            {t.search}
          </button>
          {(draft || request.q) && (
            <button className="ui-button" type="button" onClick={clear}>
              {t.clearSearch}
            </button>
          )}
          <Label
            className="field patient-status-filter"
            htmlFor="patient-status"
          >
            <span id="patient-status-label">{t.statusFilter}</span>
            <SelectField
              placeholder={t.active}
              id="patient-status"
              labelledBy="patient-status-label"
              direction={lang === "ar" ? "rtl" : "ltr"}
              value={request.status}
              onValueChange={(value) =>
                changeStatus(value as "active" | "archived" | "all")
              }
              options={[
                { value: "active", label: t.active },
                { value: "archived", label: t.archived },
                { value: "all", label: t.allStatuses },
              ]}
            />
          </Label>
        </form>
      </div>

      <ScreenReaderStatus>{status}</ScreenReaderStatus>
      {stale && (
        <p className="patient-search-feedback" role="status">
          {t.staleData}
        </p>
      )}
      {loading && (
        <p className="patient-search-feedback" aria-hidden="true">
          {result ? t.updating : t.listLoading}
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{t[error]}</p>
          {error !== "denied" && (
            <button
              className="ui-button"
              onClick={() => load(request.q, request.page)}
            >
              <RefreshCw size={16} aria-hidden />
              {t.retry}
            </button>
          )}
        </div>
      )}
      {result && (
        <>
          {result.items.length === 0 ? (
            !loading &&
            !error && (
              <div className="patient-empty">
                <FileText size={24} aria-hidden />
                <p>
                  {request.q
                    ? t.noResults
                    : request.page === 1
                      ? t.noPatients
                      : t.emptyPage}
                </p>
              </div>
            )
          ) : (
            <div className="table-scroll" aria-busy={loading}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.name}</th>
                    <th scope="col">{t.number}</th>
                    <th scope="col">{t.phone}</th>
                    <th scope="col">{t.openFile}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((patient) => (
                    <tr key={patient.id}>
                      <td>
                        <div className="row-name-cell">
                          <span className="row-avatar" aria-hidden>
                            {nameInitials(patient.name)}
                          </span>
                          <button
                            type="button"
                            className="ui-link patient-link"
                            onClick={() =>
                              onNavigate({
                                kind: "file",
                                patientId: patient.id,
                              })
                            }
                          >
                            <span>{patient.name}</span>
                          </button>
                          <Hint
                            text={
                              patient.archived
                                ? t.archivedStatusHint
                                : t.activeStatusHint
                            }
                          >
                            <span
                              className="status-indicator"
                              role="img"
                              tabIndex={0}
                              aria-label={
                                patient.archived
                                  ? t.archivedStatusHint
                                  : t.activeStatusHint
                              }
                            >
                              <span
                                className={
                                  "status-dot " +
                                  (patient.archived
                                    ? "status-dot-archived"
                                    : "status-dot-active")
                                }
                                aria-hidden
                              />
                            </span>
                          </Hint>
                        </div>
                      </td>
                      <td>
                        <bdi className="badge badge-neutral">
                          {patient.fileNumber}
                        </bdi>
                      </td>
                      <td>
                        <bdi dir="ltr">{patient.phone}</bdi>
                      </td>
                      <td>
                        <button
                          type="button"
                          role="link"
                          className="icon-btn hover-primary"
                          onClick={() =>
                            onNavigate({ kind: "file", patientId: patient.id })
                          }
                          aria-label={`${t.openFile}: ${patient.name}`}
                        >
                          <FileText size={16} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="patient-pagination" aria-label={t.pages}>
            <button
              className="ui-button"
              disabled={loading || result.page === 1}
              onClick={() => load(request.q, request.page - 1)}
            >
              <ArrowLeft size={16} className="directional" aria-hidden />
              {t.previous}
            </button>
            <span>
              {t.page} <bdi>{result.page}</bdi>
            </span>
            <button
              className="ui-button"
              disabled={loading || !result.hasNext}
              onClick={() => load(request.q, request.page + 1)}
            >
              {t.next}
              <ArrowRight size={16} className="directional" aria-hidden />
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

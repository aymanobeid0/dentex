import { useState } from "react";
import { Plus, ClipboardList } from "lucide-react";
import type { Lang } from "../../shared/i18n";
import {
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
} from "../../ui/Disclosure";
import type { NavigationGuard } from "../../ui/useDraftGuard";
import { useTreatmentPlans } from "./treatments.queries";
import { TreatmentEditor, type TreatmentEdit } from "./TreatmentEditor";
import { treatmentCopy } from "./treatments.copy";
import { arrivalTime } from "./visits.format";
import { TreatmentHistoryValues } from "./TreatmentHistoryValues";
import { VisitTreatments } from "./VisitTreatments";
import { procedureCopy } from "./procedures.copy";
export function PatientTreatmentPlans({
  patient,
  lang,
  canTreat,
  onExpired,
  onNavigationGuardChange,
}: {
  patient: { id: string; name: string; fileNumber: string; archived: boolean };
  lang: Lang;
  canTreat: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const t = treatmentCopy[lang],
    query = useTreatmentPlans(patient.id, onExpired, canTreat),
    [choice, setChoice] = useState<TreatmentEdit | null>(null);
  if (!canTreat) return <p role="status">{t.denied}</p>;
  return (
    <section
      className="treatment-plans"
      dir={lang === "ar" ? "rtl" : "ltr"}
      aria-label={t.title}
    >
      <div className="content-heading">
        <h2>
          <ClipboardList size={20} aria-hidden /> {t.title}
        </h2>
        <div className="visits-actions">
          <button
            className="ui-button"
            disabled={query.isFetching || !query.online}
            onClick={() => void query.refetch()}
          >
            {t.refresh}
          </button>
          <button
            className="primary action"
            disabled={patient.archived || !query.online || query.blocked}
            onClick={() => setChoice({ kind: "plan" })}
          >
            <Plus size={16} aria-hidden />
            {t.newPlan}
          </button>
        </div>
      </div>
      {patient.archived && <p role="status">{t.archived}</p>}
      {!query.online && <p role="status">{t.offline}</p>}
      {query.isPending && query.online && <p role="status">{t.loading}</p>}
      {query.isError && <p role="alert">{t.failed}</p>}
      {query.data && !query.blocked && (
        <>
          {!query.data.items.length && <p className="card">{t.empty}</p>}
          {query.data.items.map((plan) => (
            <article className="card treatment-plan" key={plan.id}>
              <div className="content-heading">
                <div>
                  <h3>{plan.title}</h3>
                  <span
                    className={
                      "badge " +
                      (plan.status === "active"
                        ? "badge-primary"
                        : "badge-neutral")
                    }
                  >
                    {t[plan.status]}
                  </span>
                </div>
                <div className="visits-actions">
                  {!patient.archived && (
                    <>
                      <button
                        className="ui-button"
                        disabled={plan.status !== "active" || !query.online}
                        onClick={() => setChoice({ kind: "plan", plan })}
                      >
                        {t.edit}
                      </button>
                      <button
                        className="ui-button"
                        disabled={!query.online}
                        onClick={() => setChoice({ kind: "status", plan })}
                      >
                        {plan.status === "active" ? t.cancel : t.restore}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {plan.notes && <p>{plan.notes}</p>}
              {plan.progress && (
                <p role="status">
                  {t.progress}:{" "}
                  <bdi>
                    {plan.progress.completed} /{" "}
                    {plan.progress.completed + plan.progress.pending}
                  </bdi>{" "}
                  · {t.pending}: {plan.progress.pending} · {t.cancelled}:{" "}
                  {plan.progress.cancelled}
                </p>
              )}
              {!plan.items.length && <p>{t.noItems}</p>}
              <ol className="visits-list">
                {plan.items.map((item) => (
                  <li key={item.id}>
                    <div className="visits-person">
                      <strong>{item.description}</strong>
                      {item.location && (
                        <span>
                          {t.location}: <bdi>{item.location}</bdi>
                        </span>
                      )}
                      {item.notes && <span>{item.notes}</span>}
                      <span
                        className={
                          "badge " +
                          (item.procedure ? "badge-success" : "badge-neutral")
                        }
                      >
                        {item.procedure ? t.completed : t[item.status]}
                      </span>
                    </div>
                    {!!item.performances?.length && (
                      <div>
                        {item.performances.map((performed) => (
                          <div key={performed.id}>
                            <p>
                              {performed.voidedAt
                                ? procedureCopy[lang].voided
                                : t.completed}{" "}
                              · {performed.description} ·{" "}
                              {performed.visit.doctorName} ·{" "}
                              {arrivalTime(performed.visit.startedAt, lang)}
                            </p>
                            <VisitTreatments
                              attendanceId={performed.visit.attendanceId}
                              lang={lang}
                              label={procedureCopy[lang].visit}
                              onExpired={onExpired}
                              onNavigationGuardChange={onNavigationGuardChange}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {!patient.archived &&
                      plan.status === "active" &&
                      !item.procedure && (
                        <div className="visits-actions">
                          <button
                            className="ui-button"
                            disabled={
                              item.status !== "pending" || !query.online
                            }
                            onClick={() =>
                              setChoice({ kind: "item", plan, item })
                            }
                          >
                            {t.edit}
                          </button>
                          <button
                            className="ui-button"
                            disabled={!query.online}
                            onClick={() =>
                              setChoice({ kind: "status", plan, item })
                            }
                          >
                            {item.status === "pending" ? t.cancel : t.restore}
                          </button>
                        </div>
                      )}
                  </li>
                ))}
              </ol>
              {!patient.archived && plan.status === "active" && (
                <button
                  className="ui-button"
                  disabled={!query.online}
                  onClick={() => setChoice({ kind: "item", plan })}
                >
                  <Plus size={16} aria-hidden />
                  {t.addItem}
                </button>
              )}
              <Disclosure>
                <DisclosureTrigger className="ui-button">
                  {t.history}
                </DisclosureTrigger>
                <DisclosureContent>
                  <ol className="treatment-history">
                    {plan.history.map((change) => (
                      <li key={change.id}>
                        <strong>
                          {t.changes[change.kind as keyof typeof t.changes] ??
                            t.history}
                        </strong>
                        <span>
                          {change.actorName ?? change.actorId} ·{" "}
                          {arrivalTime(change.recordedAt, lang)}
                        </span>
                        {change.reason && <p>{change.reason}</p>}
                        <div className="treatment-change-values">
                          <div>
                            <h4>{lang === "ar" ? "قبل" : "Avant"}</h4>
                            <TreatmentHistoryValues
                              value={change.before}
                              lang={lang}
                            />
                          </div>
                          <div>
                            <h4>{lang === "ar" ? "بعد" : "Après"}</h4>
                            <TreatmentHistoryValues
                              value={change.after}
                              lang={lang}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </DisclosureContent>
              </Disclosure>
            </article>
          ))}
        </>
      )}
      {choice && (
        <TreatmentEditor
          choice={choice}
          patientId={patient.id}
          lang={lang}
          onClose={() => setChoice(null)}
          onExpired={onExpired}
          onNavigationGuardChange={onNavigationGuardChange}
        />
      )}
    </section>
  );
}

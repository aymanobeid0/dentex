import { translations, type Lang } from "../../shared/i18n";
import { Modal } from "../../ui/Modal";
import { useAppointmentDetail } from "./queries";
import {
  appointmentDate,
  appointmentTime,
  statusKey,
  statusTone,
} from "./AppointmentTable";
import type { AppointmentDetail, AppointmentSnapshot } from "./api";
import { useCallback, useRef, useState } from "react";
import { AppointmentEditor, type EditKind } from "./AppointmentEditor";
import type { NavigationGuard } from "../../ui/useDraftGuard";

function Snapshot({
  value,
  lang,
  doctorName,
}: {
  value: AppointmentSnapshot;
  lang: Lang;
  doctorName: string;
}) {
  const t = translations[lang].appointments;
  return (
    <dl className="appointment-facts">
      <div>
        <dt>{t.date}</dt>
        <dd>
          <bdi>{appointmentDate(value.startsAt, lang)}</bdi>
        </dd>
      </div>
      <div>
        <dt>{t.timeRange}</dt>
        <dd>
          <bdi dir="ltr">
            {appointmentTime(value.startsAt, lang)} –{" "}
            {appointmentTime(value.endsAt, lang)}
          </bdi>
        </dd>
      </div>
      <div>
        <dt>{t.doctor}</dt>
        <dd>{value.doctor?.name || doctorName}</dd>
      </div>
      <div>
        <dt>{t.status}</dt>
        <dd>{t[statusKey[value.status]]}</dd>
      </div>
      <div>
        <dt>{t.note}</dt>
        <dd>{value.administrativeNote || t.noNote}</dd>
      </div>
      {value.cancellationReason && (
        <div>
          <dt>{t.cancellationReason}</dt>
          <dd>{value.cancellationReason}</dd>
        </div>
      )}
    </dl>
  );
}
export function AppointmentDetails({
  id,
  lang,
  canRead,
  onClose,
  onExpired,
  canWrite = false,
  onNavigationGuardChange,
}: {
  id: string;
  lang: Lang;
  canRead: boolean;
  onClose: () => void;
  onExpired: () => void;
  canWrite?: boolean;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const t = translations[lang].appointments,
    query = useAppointmentDetail(id, canRead, onExpired),
    data = query.data;
  const [editing, setEditing] = useState<{
      kind: EditKind;
      original: AppointmentDetail;
    } | null>(null),
    [saved, setSaved] = useState(false);
  const editorGuard = useRef<NavigationGuard | null>(null),
    editTrigger = useRef<HTMLElement | null>(null);
  const registerEditor = useCallback(
    (guard: NavigationGuard | null) => {
      editorGuard.current = guard;
      onNavigationGuardChange?.(guard);
    },
    [onNavigationGuardChange],
  );
  const start = (kind: EditKind) => {
    if (!data || !canRead || !canWrite) return;
    editTrigger.current = document.activeElement as HTMLElement;
    setSaved(false);
    setEditing({ kind, original: data });
  };
  const endEditing = () => {
    setEditing(null);
    requestAnimationFrame(() => editTrigger.current?.focus());
  };
  return (
    <Modal
      open
      size="wide"
      onOpenChange={(open) => {
        if (!open) {
          if (editorGuard.current) editorGuard.current(onClose);
          else onClose();
        }
      }}
      trigger={<button hidden>{t.details}</button>}
      title={t.details}
      description={t.hint}
      close={t.close}
      direction={lang === "ar" ? "rtl" : "ltr"}
    >
      {!canRead ? (
        <p role="alert">{t.readDenied}</p>
      ) : (
        <>
          {!query.online && <p role="status">{t.offline}</p>}
          {query.isPending && query.online && <p role="status">{t.loading}</p>}
          {query.isError && (
            <p role="alert">{query.blocked ? t.readDenied : t.failed}</p>
          )}
          {saved && (
            <p role="status" className="success">
              {t.updated}
            </p>
          )}
          {data && !editing && (
            <>
              <h2>
                {data.patient.name} — <bdi>{data.patient.fileNumber}</bdi>
              </h2>
              {data.patient.archived && (
                <p className="error">{t.archivedWarning}</p>
              )}
              {!data.doctor.eligible && (
                <p className="error">{t.doctorWarning}</p>
              )}
              <dl className="appointment-facts">
                <div>
                  <dt>{t.date}</dt>
                  <dd>
                    <bdi>{appointmentDate(data.startsAt, lang)}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t.timeRange}</dt>
                  <dd>
                    <bdi dir="ltr">
                      {appointmentTime(data.startsAt, lang)} –{" "}
                      {appointmentTime(data.endsAt, lang)}
                    </bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t.doctor}</dt>
                  <dd>{data.doctor.name}</dd>
                </div>
                <div>
                  <dt>{t.phone}</dt>
                  <dd>
                    <bdi dir="ltr">{data.patient.phone}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t.status}</dt>
                  <dd>
                    <span className={`badge badge-${statusTone[data.status]}`}>
                      {t[statusKey[data.status]]}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{t.note}</dt>
                  <dd>{data.administrativeNote || t.noNote}</dd>
                </div>
                <div>
                  <dt>{t.createdBy}</dt>
                  <dd>{data.createdBy.name}</dd>
                </div>
                <div>
                  <dt>{t.createdAt}</dt>
                  <dd>
                    <bdi>
                      {appointmentDate(data.createdAt, lang)}{" "}
                      {appointmentTime(data.createdAt, lang)}
                    </bdi>
                  </dd>
                </div>
              </dl>
              {canRead && canWrite && (
                <div className="appointment-pagination">
                  {data.status === "booked" && !data.patient.archived && (
                    <button
                      type="button"
                      className="ui-button"
                      onClick={() => start("schedule")}
                    >
                      {t.reschedule}
                    </button>
                  )}
                  {!data.patient.archived && (
                    <button
                      type="button"
                      className="ui-button"
                      onClick={() => start("note")}
                    >
                      {t.editNote}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => start("status")}
                  >
                    {t.changeStatus}
                  </button>
                </div>
              )}
              <h2>{t.history}</h2>
              <ol className="appointment-history">
                {data.changes.map((change) => (
                  <li key={change.id}>
                    <p>
                      {change.actor.name} —{" "}
                      <bdi>
                        {appointmentDate(change.createdAt, lang)}{" "}
                        {appointmentTime(change.createdAt, lang)}
                      </bdi>{" "}
                      — {change.action === "created" ? t.created : t.changed}
                    </p>
                    {change.before && (
                      <>
                        <h3>{t.before}</h3>
                        <Snapshot
                          value={change.before}
                          lang={lang}
                          doctorName={data.doctor.name}
                        />
                      </>
                    )}
                    <h3>{t.after}</h3>
                    <Snapshot
                      value={change.after}
                      lang={lang}
                      doctorName={data.doctor.name}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
          <button
            type="button"
            className="ui-button"
            disabled={!query.online || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t.refresh}
          </button>
        </>
      )}
      {editing && (
        <AppointmentEditor
          key={editing.kind}
          original={editing.original}
          latestVersion={data?.editVersion}
          kind={editing.kind}
          lang={lang}
          allowed={canRead && canWrite && !query.blocked}
          onExpired={onExpired}
          onSaved={() => {
            setSaved(true);
            endEditing();
          }}
          onCancel={endEditing}
          onNavigationGuardChange={registerEditor}
          review={async () => {
            if (!canRead || !canWrite) throw new Error("forbidden");
            const result = await query.refetch();
            if (result.isError || !result.data) throw result.error;
            return result.data;
          }}
        />
      )}
    </Modal>
  );
}

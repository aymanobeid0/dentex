import { DateField, TimeField } from "../../ui/DateTimeField";
import { useId, useRef, useState } from "react";
import { ApiError } from "../../shared/api/request";
import { translations, type Lang } from "../../shared/i18n";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { useAppointmentDoctors, useAppointmentEdit } from "./queries";
import {
  appointmentDate,
  appointmentTime,
  statusKey,
} from "./AppointmentTable";
import type {
  AppointmentDetail,
  AppointmentEdit,
  AppointmentStatus,
} from "./api";

export type EditKind = AppointmentEdit["kind"];
const initialDraft = (data: AppointmentDetail) => ({
  doctorId: data.doctor.id,
  date: data.startsAt.slice(0, 10),
  time: data.startsAt.slice(11, 16),
  duration: String(
    (Date.parse(data.endsAt) - Date.parse(data.startsAt)) / 60000,
  ),
  note: data.administrativeNote || "",
  status: data.status,
  cancellationReason: "",
});

export function AppointmentEditor({
  original,
  latestVersion,
  kind,
  lang,
  allowed,
  onExpired,
  onSaved,
  onCancel,
  onNavigationGuardChange,
  review,
}: {
  original: AppointmentDetail;
  latestVersion?: number;
  kind: EditKind;
  lang: Lang;
  allowed: boolean;
  onExpired: () => void;
  onSaved: () => void;
  onCancel: () => void;
  onNavigationGuardChange: (guard: NavigationGuard | null) => void;
  review: () => Promise<AppointmentDetail>;
}) {
  const t = translations[lang].appointments,
    id = useId(),
    direction = lang === "ar" ? "rtl" : "ltr";
  const [base, setBase] = useState(original),
    [draft, setDraft] = useState(() => initialDraft(original));
  const [issue, setIssue] = useState<keyof typeof t | "">(""),
    [reviewed, setReviewed] = useState<AppointmentDetail | null>(null),
    [reviewing, setReviewing] = useState(false),
    [reviewError, setReviewError] = useState(false),
    [confirm, setConfirm] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null),
    submitting = useRef(false);
  const mutation = useAppointmentEdit(),
    doctors = useAppointmentDoctors(kind === "schedule" && allowed, onExpired);
  const changed =
    latestVersion !== undefined && latestVersion !== base.editVersion;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initialDraft(base)) || !!issue;
  const guard = useDraftGuard(
    dirty,
    mutation.isPending,
    () => {
      setDraft(initialDraft(base));
      setIssue("");
    },
    onNavigationGuardChange,
  );
  const blocked =
    !allowed ||
    mutation.isPending ||
    reviewing ||
    !!issue ||
    changed ||
    !doctors.online ||
    (base.patient.archived &&
      !(kind === "status" && draft.status === "cancelled")) ||
    (kind === "schedule" &&
      (base.status !== "booked" ||
        !draft.date ||
        !draft.time ||
        doctors.isError ||
        !doctors.data?.some((doctor) => doctor.id === draft.doctorId)));
  function change<Key extends keyof typeof draft>(
    key: Key,
    value: (typeof draft)[Key],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    if (
      !["editConflict", "editUncertain", "readDenied", "missing"].includes(
        issue,
      )
    )
      setIssue("");
  }
  async function save() {
    if (submitting.current || blocked) return;
    submitting.current = true;
    const input: AppointmentEdit =
      kind === "schedule"
        ? {
            kind,
            editVersion: base.editVersion,
            doctorId: draft.doctorId,
            date: draft.date,
            time: draft.time,
            durationMinutes: Number(draft.duration),
          }
        : kind === "note"
          ? {
              kind,
              editVersion: base.editVersion,
              administrativeNote: draft.note,
            }
          : {
              kind,
              editVersion: base.editVersion,
              status: draft.status,
              ...(draft.status === "cancelled"
                ? { cancellationReason: draft.cancellationReason }
                : {}),
            };
    try {
      await mutation.mutateAsync({ current: base, input });
      guard.release();
      setConfirm(false);
      onSaved();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) {
        onExpired();
        return;
      }
      const codes: Record<string, keyof typeof t> = {
        edit_conflict: "editConflict",
        appointment_overlap: "overlap",
        appointment_in_past: "past",
        appointment_not_booked: "notBooked",
        doctor_ineligible: "ineligible",
        patient_archived: "archivedWarning",
        forbidden: "readDenied",
        not_found: "missing",
        invalid_input: "invalid",
      };
      setIssue(
        !(error instanceof ApiError) ||
          error.kind === "uncertain" ||
          error.kind === "network" ||
          error.status >= 500 ||
          error.status === 408
          ? "editUncertain"
          : codes[error.code || ""] || "failed",
      );
      setReviewed(null);
      setConfirm(false);
    } finally {
      submitting.current = false;
    }
  }
  async function reviewLatest() {
    if (!allowed || reviewing || mutation.isPending) return;
    setReviewing(true);
    setReviewed(null);
    setReviewError(false);
    try {
      setReviewed(await review());
    } catch {
      setReviewError(true);
    } finally {
      setReviewing(false);
    }
  }
  function acknowledge(replace: boolean) {
    if (
      !reviewed ||
      !allowed ||
      reviewing ||
      (latestVersion !== undefined && latestVersion !== reviewed.editVersion)
    )
      return;
    setBase(reviewed);
    if (replace) setDraft(initialDraft(reviewed));
    setIssue("");
    setReviewed(null);
    setReviewError(false);
  }
  const options = doctors.data || [];
  return (
    <section className="appointment-editor">
      {allowed && (
        <p>
          {base.patient.name} — <bdi>{base.patient.fileNumber}</bdi> ·{" "}
          <bdi>{appointmentDate(base.startsAt, lang)}</bdi> ·{" "}
          <bdi dir="ltr">{appointmentTime(base.startsAt, lang)}</bdi>
        </p>
      )}
      <h2>
        {kind === "schedule"
          ? t.reschedule
          : kind === "note"
            ? t.editNote
            : t.changeStatus}
      </h2>
      {!allowed && <p role="alert">{t.readDenied}</p>}
      {base.patient.archived && <p role="alert">{t.archivedWarning}</p>}
      {!doctors.online && <p role="status">{t.offline}</p>}
      {changed && <p role="alert">{t.recordChanged}</p>}
      {issue && (
        <p role="alert" className="error">
          {t[issue]}
        </p>
      )}
      {(issue || changed) && (
        <>
          <button
            type="button"
            className="ui-button"
            disabled={
              !allowed || !doctors.online || reviewing || mutation.isPending
            }
            onClick={() => void reviewLatest()}
          >
            {t.review}
          </button>
          {reviewing && <p role="status">{t.loading}</p>}
          {reviewError && <p role="alert">{t.failed}</p>}
          {reviewed && (
            <div className="card appointment-review">
              <h3>{t.latest}</h3>
              <p>{t.reviewHint}</p>
              <dl className="appointment-facts">
                <div>
                  <dt>{t.date}</dt>
                  <dd>{appointmentDate(reviewed.startsAt, lang)}</dd>
                </div>
                <div>
                  <dt>{t.timeRange}</dt>
                  <dd>
                    <bdi dir="ltr">
                      {appointmentTime(reviewed.startsAt, lang)} –{" "}
                      {appointmentTime(reviewed.endsAt, lang)}
                    </bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t.doctor}</dt>
                  <dd>{reviewed.doctor.name}</dd>
                </div>
                <div>
                  <dt>{t.status}</dt>
                  <dd>{t[statusKey[reviewed.status]]}</dd>
                </div>
                <div>
                  <dt>{t.note}</dt>
                  <dd>{reviewed.administrativeNote || t.noNote}</dd>
                </div>
              </dl>
              <div className="appointment-pagination">
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => acknowledge(true)}
                >
                  {t.useLatest}
                </button>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => acknowledge(false)}
                >
                  {t.keepDraft}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <form
        className="clinic-form booking-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (blocked) return;
          if (kind === "status" && draft.status === "cancelled") {
            returnFocus.current = document.activeElement as HTMLElement;
            setConfirm(true);
          } else void save();
        }}
      >
        {kind === "schedule" && (
          <>
            {doctors.isPending && <p role="status">{t.loading}</p>}
            {doctors.isError && <p role="alert">{t.failed}</p>}
            <div className="field">
              <Label htmlFor={`${id}-doctor`}>{t.doctor}</Label>
              <SelectField
                id={`${id}-doctor`}
                direction={direction}
                value={draft.doctorId}
                placeholder={t.choose}
                options={[
                  ...options,
                  ...(options.some((doctor) => doctor.id === draft.doctorId)
                    ? []
                    : [{ id: draft.doctorId, name: base.doctor.name }]),
                ].map((doctor) => ({ value: doctor.id, label: doctor.name }))}
                onValueChange={(value) => change("doctorId", value)}
                disabled={mutation.isPending}
                required
              />
            </div>
            <div className="field">
              <Label htmlFor={`${id}-date`}>{t.date}</Label>
              <DateField
                id={`${id}-date`}
                label={t.date}
                lang={lang}
                value={draft.date}
                onValueChange={(value) => change("date", value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="field">
              <Label htmlFor={`${id}-time`}>{t.time}</Label>
              <TimeField
                id={`${id}-time`}
                label={t.time}
                lang={lang}
                value={draft.time}
                onValueChange={(value) => change("time", value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="field">
              <Label htmlFor={`${id}-duration`}>{t.duration}</Label>
              <input
                className="ui-input"
                id={`${id}-duration`}
                type="number"
                min="5"
                max="240"
                step="5"
                value={draft.duration}
                onChange={(event) => change("duration", event.target.value)}
                disabled={mutation.isPending}
                required
              />
            </div>
          </>
        )}
        {kind === "note" && (
          <div className="field wide">
            <Label htmlFor={`${id}-note`}>{t.note}</Label>
            <textarea
              className="ui-textarea"
              id={`${id}-note`}
              maxLength={2000}
              value={draft.note}
              onChange={(event) => change("note", event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
        )}
        {kind === "status" && (
          <>
            <div className="field wide">
              <Label htmlFor={`${id}-status`}>{t.status}</Label>
              <SelectField
                id={`${id}-status`}
                direction={direction}
                value={draft.status}
                placeholder={t.status}
                options={Object.entries(statusKey).map(([value, key]) => ({
                  value,
                  label: t[key],
                }))}
                onValueChange={(value) =>
                  change("status", value as AppointmentStatus)
                }
                disabled={mutation.isPending}
              />
            </div>
            {draft.status === "cancelled" && (
              <div className="field wide">
                <Label htmlFor={`${id}-reason`}>{t.cancellationReason}</Label>
                <textarea
                  className="ui-textarea"
                  id={`${id}-reason`}
                  maxLength={2000}
                  value={draft.cancellationReason}
                  onChange={(event) =>
                    change("cancellationReason", event.target.value)
                  }
                  disabled={mutation.isPending}
                />
              </div>
            )}
          </>
        )}
        <div className="wide appointment-pagination">
          <button className="primary action" disabled={blocked}>
            {mutation.isPending ? t.saving : t.saveChanges}
          </button>
          <button
            type="button"
            className="ui-button"
            disabled={mutation.isPending}
            onClick={() => guard.requestLeave(onCancel)}
          >
            {t.cancelEditing}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirm}
        direction={direction}
        title={t.cancelConfirm}
        description={t.cancelConfirmHint}
        cancel={t.stay}
        confirm={t.confirmCancellation}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void save()}
        busy={mutation.isPending}
        blocked={blocked}
        returnFocus={returnFocus}
      />
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={direction}
        title={t.discardTitle}
        description={t.discardHint}
        stay={t.stay}
        discard={t.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
    </section>
  );
}

import { useId, useRef, useState } from "react";
import { translations, type Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { EditReview } from "../../ui/EditReview";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import {
  correctionChoices,
  type Attendance,
  type CorrectionChoice,
} from "./api";
import {
  useAttendanceDetail,
  useAttendanceReview,
  useCorrectionWrite,
} from "./queries";
import { arrivalTime } from "./visits.format";

export function CorrectionHistory({
  row,
  lang,
}: {
  row: Attendance;
  lang: Lang;
}) {
  const t = translations[lang].visits;
  return (
    <>
      {row.invalidEntries?.map((entry) => (
        <p key={entry.id}>
          {t.invalidEntry} ·{" "}
          <time dateTime={entry.startedAt}>
            {arrivalTime(entry.startedAt, lang)}
          </time>
        </p>
      ))}
      {row.corrections?.length ? (
        <section aria-label={t.corrections}>
          <h3>{t.corrections}</h3>
          <ol>
            {row.corrections.map((change) => (
              <li key={change.id}>
                <span>
                  {t.attendanceStatuses[change.before.status]} →{" "}
                  {t.attendanceStatuses[change.after.status]}
                </span>
                {change.before.visit && change.after.visit && (
                  <span>
                    {" "}
                    · {t.visitStatuses[change.before.visit.status]} →{" "}
                    {t.visitStatuses[change.after.visit.status]}
                  </span>
                )}
                <p>{change.actor.name}</p>
                <time dateTime={change.recordedAt}>
                  {arrivalTime(change.recordedAt, lang)}
                </time>
                {change.reason && <p>{change.reason}</p>}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

export function AttendanceCorrections({
  row,
  lang,
  onExpired,
  onNavigationGuardChange,
}: {
  row: Attendance;
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const t = translations[lang].visits;
  const [mode, setMode] = useState<"correction" | "delete" | null>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const open = (next: "correction" | "delete") => {
    returnFocus.current = document.activeElement as HTMLElement;
    setMode(next);
  };
  return (
    <>
      {correctionChoices(row).length > 0 && (
        <button className="ui-button" onClick={() => open("correction")}>
          {t.correctStatus}
        </button>
      )}
      {!row.visit && (
        <button className="ui-button" onClick={() => open("delete")}>
          {t.deleteFalseAttendance}
        </button>
      )}
      {mode && (
        <CorrectionDialog
          key={mode}
          row={row}
          mode={mode}
          lang={lang}
          onExpired={onExpired}
          onNavigationGuardChange={onNavigationGuardChange}
          returnFocus={returnFocus}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}

function CorrectionDialog({
  row,
  mode,
  lang,
  onExpired,
  onClose,
  onNavigationGuardChange,
  returnFocus,
}: {
  row: Attendance;
  mode: "correction" | "delete";
  lang: Lang;
  onExpired: () => void;
  onClose: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const t = translations[lang].visits,
    dt = translations[lang].editing,
    dir = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const [current, setCurrent] = useState(row),
    [reason, setReason] = useState(""),
    [choice, setChoice] = useState<CorrectionChoice>(
      correctionChoices(row)[0] ?? "mark_left",
    ),
    [confirmation, setConfirmation] = useState(false),
    [issue, setIssue] = useState(""),
    [recovery, setRecovery] = useState<"uncertain" | "conflict" | null>(null),
    [review, setReview] = useState<Attendance | null>(null),
    [missing, setMissing] = useState(false),
    [reviewBusy, setReviewBusy] = useState(false),
    [reviewFailed, setReviewFailed] = useState(false);
  const query = useAttendanceDetail(row, onExpired),
    mutation = useCorrectionWrite(),
    readReview = useAttendanceReview(),
    submitting = useRef(false);
  const denied =
      (query.error instanceof ApiError && query.error.status === 403) ||
      issue === t.readDenied,
    absent =
      missing ||
      (query.error instanceof ApiError && query.error.status === 404),
    busy = mutation.isPending || reviewBusy,
    changed =
      !!query.data &&
      (query.data.editVersion !== current.editVersion ||
        query.data.visit?.editVersion !== current.visit?.editVersion),
    choices = correctionChoices(current),
    blocked =
      busy ||
      !query.online ||
      denied ||
      query.isPending ||
      query.isError ||
      absent ||
      !!recovery ||
      changed ||
      (mode === "delete" ? !!current.visit : !choices.includes(choice));
  const guard = useDraftGuard(
    !denied &&
      (!!reason ||
        !!recovery ||
        choice !== (correctionChoices(row)[0] ?? "mark_left")),
    busy,
    onClose,
    onNavigationGuardChange,
  );
  const close = () => guard.requestLeave(onClose);
  async function reviewServer() {
    if (busy || !query.online) return;
    setReviewBusy(true);
    setReviewFailed(false);
    setReview(null);
    try {
      const result = await readReview(current.id);
      setReview(result.items[0]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setMissing(true);
      else if (error instanceof ApiError && error.status === 403)
        setIssue(t.readDenied);
      else if (error instanceof ApiError && error.status === 401) onExpired();
      else setReviewFailed(true);
    } finally {
      setReviewBusy(false);
    }
  }
  async function save() {
    if (blocked || submitting.current) return;
    submitting.current = true;
    setIssue("");
    try {
      await mutation.mutateAsync(
        mode === "delete"
          ? { row: current, remove: true }
          : { row: current, choice, reason },
      );
      guard.release();
      onClose();
    } catch (error) {
      setConfirmation(false);
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (error instanceof ApiError && error.status === 403)
        setIssue(t.readDenied);
      else if (error instanceof ApiError && error.status === 409) {
        setRecovery("conflict");
        setReview(null);
      } else if (error instanceof ApiError && error.status === 404)
        setMissing(true);
      else if (
        !(error instanceof ApiError) ||
        ["network", "uncertain"].includes(error.kind) ||
        error.status === 408 ||
        error.status >= 500
      ) {
        setRecovery("uncertain");
        setReview(null);
      } else setIssue(t.failed);
    } finally {
      submitting.current = false;
    }
  }
  const recoveryUi = (
    <>
      {query.isPending && query.online && <p role="status">{t.loading}</p>}
      {!query.online && <p role="status">{t.offline}</p>}
      {query.isError && !denied && <p role="alert">{t.failed}</p>}
      {issue && <p role="alert">{issue}</p>}
      {absent ? (
        <p role="alert">{t.correctionMissing}</p>
      ) : (
        <EditReview
          lang={lang}
          issue={recovery}
          changed={changed}
          busy={busy || !query.online}
          failed={reviewFailed}
          reviewed={!!review}
          onReview={() => void reviewServer()}
          onAccept={(keep) => {
            if (!review) return;
            setCurrent(review);
            if (!keep) {
              setReason("");
              setChoice(correctionChoices(review)[0] ?? "mark_left");
            }
            setReview(null);
            setRecovery(null);
            setConfirmation(false);
            setIssue("");
          }}
        >
          {review && (
            <p>
              {review.patient.name} · {t.attendanceStatuses[review.status]} ·{" "}
              {review.doctor.name}
            </p>
          )}
        </EditReview>
      )}
    </>
  );
  const content = denied ? (
    <p role="alert">{t.readDenied}</p>
  ) : (
    <>
      {!absent && (
        <p>
          <strong>{current.patient.name}</strong> · {current.doctor.name}
        </p>
      )}
      {mode === "correction" && (
        <>
          <div className="field">
            <Label htmlFor={`${id}-kind`}>{t.correctionKind}</Label>
            <SelectField
              id={`${id}-kind`}
              placeholder={t.correctionKind}
              direction={dir}
              value={choice}
              onValueChange={(value) => {
                setChoice(value as CorrectionChoice);
                setConfirmation(false);
              }}
              disabled={busy || !!recovery}
              options={choices.map((value) => ({
                value,
                label: t.correctionChoices[value],
              }))}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-reason`}>{t.correctionReason}</Label>
            <textarea
              className="ui-textarea"
              id={`${id}-reason`}
              value={reason}
              maxLength={500}
              disabled={busy || !!recovery}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </>
      )}
      {recoveryUi}
    </>
  );
  return (
    <>
      {mode === "delete" ? (
        <ConfirmDialog
          open
          direction={dir}
          title={t.deleteFalseAttendance}
          description={t.deleteFalseDescription}
          cancel={t.cancel}
          confirm={t.confirmFalseDelete}
          busy={busy}
          blocked={blocked}
          returnFocus={returnFocus}
          onCancel={close}
          onConfirm={() => void save()}
        >
          {content}
        </ConfirmDialog>
      ) : (
        <Modal
          open
          direction={dir}
          title={t.correctStatus}
          description={t.correctionDescription}
          close={t.close}
          trigger={<span />}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <form
            className="visits-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (choice.startsWith("invalidate_")) setConfirmation(true);
              else void save();
            }}
          >
            {content}
            <div className="form-actions">
              <button
                type="button"
                className="ui-button"
                disabled={busy}
                onClick={close}
              >
                {t.cancel}
              </button>
              {!denied && (
                <button className="primary action" disabled={blocked}>
                  {t.saveCorrection}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <ConfirmDialog
          open
          direction={dir}
          title={t.invalidEntry}
          description={t.invalidateDescription}
          cancel={t.cancel}
          confirm={t.confirmInvalidation}
          busy={busy}
          blocked={blocked}
          returnFocus={returnFocus}
          onCancel={() => setConfirmation(false)}
          onConfirm={() => void save()}
        />
      )}
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={dir}
        title={dt.discardTitle}
        description={dt.discardHint}
        stay={dt.stay}
        discard={dt.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
    </>
  );
}

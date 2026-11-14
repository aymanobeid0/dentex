import { useId, useRef, useState, type RefObject } from "react";
import { ArrowRightLeft, LogOut, UserRoundPlus } from "lucide-react";
import { translations, type Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { WriteReview } from "../../ui/WriteReview";
import { EditReview } from "../../ui/EditReview";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { PatientPicker } from "./PatientPicker";
import {
  useQueue,
  useDoctors,
  useAttendanceWrite,
  useAttendanceReview,
} from "./queries";
import { type Attendance, type PatientChoice } from "./api";
type Props = {
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export function arrivalTime(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Nouakchott",
    calendar: "gregory",
  }).format(new Date(value));
}
export function VisitsPage(props: Props) {
  const { lang, onExpired } = props,
    t = translations[lang].visits;
  const queue = useQueue(onExpired),
    [action, setAction] = useState<
      | { kind: "arrive" }
      | { kind: "transfer" | "leave"; row: Attendance }
      | null
    >(null);
  const arriveTrigger = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null),
    [notice, setNotice] = useState(false);
  const open = (next: NonNullable<typeof action>) => {
    returnFocus.current = document.activeElement as HTMLElement;
    setNotice(false);
    setAction(next);
  };
  const close = () => {
    setAction(null);
    requestAnimationFrame(() =>
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : arriveTrigger.current
      )?.focus(),
    );
  };
  return (
    <>
      <div className="content-heading">
        <h1>{t.title}</h1>
        <button
          ref={arriveTrigger}
          className="primary action"
          onClick={() => open({ kind: "arrive" })}
          disabled={queue.blocked}
        >
          <UserRoundPlus size={16} aria-hidden />
          {t.arrive}
        </button>
      </div>
      <div className="visits-toolbar">
        <button
          className="ui-button"
          disabled={queue.isFetching || !queue.online}
          onClick={() => void queue.refetch()}
        >
          {t.refresh}
        </button>
      </div>
      {!queue.online && (
        <p role="status" className="error">
          {t.offline}
        </p>
      )}
      {queue.isPending && queue.online && <p role="status">{t.loading}</p>}
      {queue.isError && (
        <p role="alert" className="error">
          {queue.blocked ? t.readDenied : t.failed}
        </p>
      )}
      {notice && <p role="status">{t.saved}</p>}
      {queue.data && !queue.blocked && (
        <div className="visits-queues">
          {queue.data.doctors.map((doctor) => {
            const rows = queue.data!.items.filter(
              (row) => row.doctor.id === doctor.id,
            );
            return (
              <section
                key={doctor.id}
                className="card visits-queue"
                aria-label={`${t.queue} ${doctor.name}`}
              >
                <h2>{doctor.name}</h2>
                {!doctor.eligible && <p className="error">{t.ineligible}</p>}
                {!rows.length ? (
                  <p>{t.empty}</p>
                ) : (
                  <ol className="visits-list">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <div className="visits-person">
                          <strong>{row.patient.name}</strong>
                          <span>
                            {t.fileNumber} <bdi>{row.patient.fileNumber}</bdi>
                          </span>
                          <time dateTime={row.arrivedAt}>
                            {arrivalTime(row.arrivedAt, lang)}
                          </time>
                          {row.patient.archived && (
                            <span className="error">{t.archived}</span>
                          )}
                        </div>
                        <div className="visits-actions">
                          <button
                            className="ui-button"
                            onClick={() => open({ kind: "transfer", row })}
                          >
                            <ArrowRightLeft size={16} aria-hidden />
                            {t.transfer}
                          </button>
                          <button
                            className="ui-button"
                            onClick={() => open({ kind: "leave", row })}
                          >
                            <LogOut size={16} aria-hidden />
                            {t.leave}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
          {!queue.data.doctors.length && (
            <section className="card">
              <p>{t.noDoctors}</p>
              <p>{t.empty}</p>
            </section>
          )}
        </div>
      )}
      {action && (
        <AttendanceDialog
          {...props}
          action={action}
          missing={
            action.kind !== "arrive" &&
            !!queue.data &&
            !queue.blocked &&
            !queue.data.items.some((row) => row.id === action.row.id)
          }
          latest={
            action.kind === "arrive"
              ? undefined
              : queue.data?.items.find((row) => row.id === action.row.id)
          }
          returnFocus={returnFocus}
          onClose={close}
          onSaved={() => {
            setNotice(true);
            close();
          }}
        />
      )}
    </>
  );
}
function AttendanceDialog({
  action,
  latest,
  missing,
  returnFocus,
  onClose,
  onSaved,
  ...props
}: Props & {
  action: { kind: "arrive" } | { kind: "transfer" | "leave"; row: Attendance };
  latest?: Attendance;
  missing: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang, onExpired, onNavigationGuardChange } = props,
    t = translations[lang].visits,
    dt = translations[lang].editing,
    dir = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const [patient, setPatient] = useState<PatientChoice | undefined>(),
    [doctorId, setDoctorId] = useState(""),
    [searchDirty, setSearchDirty] = useState(false);
  const [current, setCurrent] = useState(
    action.kind === "arrive" ? undefined : action.row,
  );
  const [issue, setIssue] = useState(""),
    [recovery, setRecovery] = useState<"uncertain" | "conflict" | null>(null),
    [review, setReview] = useState<{ items: Attendance[] } | null>(null),
    [reviewFailed, setReviewFailed] = useState(false),
    [reviewBusy, setReviewBusy] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const doctors = useDoctors(onExpired),
    mutation = useAttendanceWrite(),
    reviewAttendance = useAttendanceReview(),
    submitting = useRef(false);
  const changed = !!(
      current &&
      (missing || (latest && latest.editVersion > current.editVersion))
    ),
    busy = mutation.isPending || reviewBusy;
  const guard = useDraftGuard(
    !!patient || !!doctorId || searchDirty || !!recovery,
    busy,
    onClose,
    onNavigationGuardChange,
  );
  const blocked =
    busy ||
    !doctors.online ||
    doctors.blocked ||
    issue === t.readDenied ||
    (!!recovery && !acknowledged) ||
    changed ||
    !!(current && current.status !== "waiting");
  async function save() {
    if (submitting.current || blocked) return;
    if (
      action.kind !== "leave" &&
      (!doctorId || (action.kind === "arrive" && !patient))
    ) {
      setIssue(t.invalid);
      return;
    }
    submitting.current = true;
    setIssue("");
    try {
      await mutation.mutateAsync(
        action.kind === "arrive"
          ? { kind: "arrive", patientId: patient!.id, doctorId }
          : {
              kind: "edit",
              current: current!,
              input:
                action.kind === "transfer"
                  ? {
                      kind: "transfer",
                      doctorId,
                      editVersion: current!.editVersion,
                    }
                  : { kind: "leave", editVersion: current!.editVersion },
            },
      );
      guard.release();
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (error instanceof ApiError && error.status === 403)
        setIssue(t.readDenied);
      else if (error instanceof ApiError && error.code === "edit_conflict") {
        setRecovery("conflict");
        setAcknowledged(false);
        setReview(null);
      } else if (
        !(error instanceof ApiError) ||
        ["uncertain", "network"].includes(error.kind) ||
        error.status === 408 ||
        error.status >= 500
      ) {
        setRecovery("uncertain");
        setAcknowledged(false);
        setReview(null);
      } else setIssue(t[error.code as keyof typeof t] || t.failed);
    } finally {
      submitting.current = false;
      mutation.reset();
    }
  }
  async function reviewServer() {
    if (!doctors.online || busy) return;
    setReviewBusy(true);
    setReviewFailed(false);
    setReview(null);
    setAcknowledged(false);
    try {
      setReview(await reviewAttendance(current?.id));
    } catch (error) {
      setReviewFailed(true);
      if (error instanceof ApiError && error.status === 401) onExpired();
    } finally {
      setReviewBusy(false);
    }
  }
  const summary = review && (
    <div aria-label={t.reviewed}>
      {review.items
        .filter((row) => current || row.patient.id === patient?.id)
        .map((row) => (
          <p key={row.id}>
            {row.patient.name} · {row.doctor.name} ·{" "}
            {row.status === "waiting" ? t.waiting : t.leave} ·{" "}
            {arrivalTime(row.arrivedAt, lang)}
          </p>
        ))}
      {!current &&
        !review.items.some((row) => row.patient.id === patient?.id) && (
          <p>{t.reviewEmpty}</p>
        )}
    </div>
  );
  const recoveryUi = (
    <>
      {issue && (
        <p role="alert" className="error">
          {issue}
        </p>
      )}
      {!doctors.online && (
        <p role="status" className="error">
          {t.offline}
        </p>
      )}
      <WriteReview
        lang={lang}
        uncertain={action.kind === "arrive" && recovery === "uncertain"}
        busy={busy || !doctors.online}
        failed={reviewFailed}
        reviewed={!!review}
        acknowledged={acknowledged}
        onReview={() => void reviewServer()}
        onAcknowledge={() => setAcknowledged(true)}
      >
        {summary}
      </WriteReview>
      {current && (
        <EditReview
          lang={lang}
          issue={recovery}
          changed={changed}
          busy={busy || !doctors.online}
          failed={reviewFailed}
          reviewed={!!review}
          onReview={() => void reviewServer()}
          onAccept={(keep) => {
            const next = review?.items[0];
            if (!next) return;
            setCurrent(next);
            if (!keep) setDoctorId(next.doctor.id);
            setRecovery(null);
            setReview(null);
            setAcknowledged(false);
            setIssue("");
          }}
        >
          {summary}
        </EditReview>
      )}
    </>
  );
  const close = () => guard.requestLeave(onClose);
  const form = (
    <>
      {action.kind === "arrive" ? (
        <PatientPicker
          lang={lang}
          canWrite
          disabled={busy || (!!recovery && !acknowledged)}
          selected={patient}
          onSelect={setPatient}
          onExpired={onExpired}
          onDraftChange={setSearchDirty}
        />
      ) : (
        <p>
          <strong>{current?.patient.name}</strong> ·{" "}
          <bdi>{current?.patient.fileNumber}</bdi>
        </p>
      )}
      {action.kind !== "leave" && (
        <div className="field">
          <Label htmlFor={`${id}-doctor`}>{t.doctor}</Label>
          <SelectField
            id={`${id}-doctor`}
            direction={dir}
            value={doctorId}
            onValueChange={setDoctorId}
            disabled={
              busy ||
              doctors.isPending ||
              doctors.isError ||
              (!!recovery && !acknowledged)
            }
            placeholder={t.chooseDoctor}
            options={(doctors.data || []).map((doctor) => ({
              value: doctor.id,
              label: doctor.name,
            }))}
          />
          {doctors.isPending && doctors.online && (
            <p role="status">{t.loading}</p>
          )}
          {doctors.isError && (
            <p role="alert" className="error">
              {doctors.blocked ? t.readDenied : t.failed}
            </p>
          )}
          {doctors.data && !doctors.data.length && <p>{t.noDoctors}</p>}
        </div>
      )}
      {recoveryUi}
    </>
  );
  return (
    <>
      {action.kind === "leave" ? (
        <ConfirmDialog
          open
          direction={dir}
          title={t.leave}
          description={t.leaveDescription}
          cancel={t.cancel}
          confirm={t.leave}
          onCancel={close}
          onConfirm={() => void save()}
          busy={busy}
          blocked={blocked}
          returnFocus={returnFocus}
        >
          {form}
        </ConfirmDialog>
      ) : (
        <Modal
          open
          direction={dir}
          title={action.kind === "arrive" ? t.arrive : t.transfer}
          description={
            action.kind === "arrive"
              ? t.draftDescription
              : t.transferDescription
          }
          close={t.close}
          trigger={<span />}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.isConnected && returnFocus.current.focus();
          }}
        >
          <form
            className="visits-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {form}
            <div className="form-actions">
              <button
                type="button"
                className="ui-button"
                onClick={close}
                disabled={busy}
              >
                {t.cancel}
              </button>
              <button className="primary action" disabled={blocked}>
                {busy
                  ? t.loading
                  : action.kind === "arrive"
                    ? t.save
                    : t.saveTransfer}
              </button>
            </div>
          </form>
        </Modal>
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

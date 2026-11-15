import {
  AttendanceCorrections,
  CorrectionHistory,
} from "./AttendanceCorrections";
import { arrivalTime } from "./visits.format";
import { AppointmentLinkDialog } from "./AppointmentLinkDialog";
import { AppointmentReference } from "./AppointmentReference";
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
import {VisitTreatments} from "./VisitTreatments";
type Props = {
  canTreat?:boolean;
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export function VisitsPage(props: Props) {
  const { lang, onExpired } = props,
    t = translations[lang].visits;
  const queue = useQueue(onExpired),
    [action, setAction] = useState<
      | { kind: "arrive" }
      | {
          kind: "transfer" | "leave" | "start" | "complete";
          row: Attendance;
          previous?: Attendance;
        }
      | { kind: "link"; row: Attendance }
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
                          <CorrectionHistory row={row} lang={lang} />
                          <AppointmentReference row={row} lang={lang} />
                          <span>
                            {t.fileNumber} <bdi>{row.patient.fileNumber}</bdi>
                          </span>
                          <time dateTime={row.arrivedAt}>
                            {arrivalTime(row.arrivedAt, lang)}
                          </time>
                          <span>
                            {row.status === "with_doctor"
                              ? t.withDoctor
                              : t.waiting}
                          </span>
                          {row.visit && (
                            <span>
                              {t.entry}:{" "}
                              <time dateTime={row.visit.startedAt}>
                                {arrivalTime(row.visit.startedAt, lang)}
                              </time>
                            </span>
                          )}
                          {row.patient.archived && (
                            <span className="error">{t.archived}</span>
                          )}
                        </div>
                        <div className="visits-actions">
                          <AttendanceCorrections row={row} {...props} />
                          {row.visit&&props.canTreat&&<VisitTreatments attendanceId={row.id} lang={lang} onExpired={onExpired} onNavigationGuardChange={props.onNavigationGuardChange}/>}
                          {row.visit && (
                            <button
                              className="ui-button"
                              onClick={() => open({ kind: "link", row })}
                            >
                              {t.linkAppointment}
                            </button>
                          )}
                          {row.status === "waiting" ? (
                            <>
                              <button
                                className="ui-button"
                                disabled={
                                  row.patient.archived || !row.doctor.eligible
                                }
                                onClick={() =>
                                  open({
                                    kind: "start",
                                    row,
                                    previous: rows.find(
                                      (item) => item.status === "with_doctor",
                                    ),
                                  })
                                }
                              >
                                {t.start}
                              </button>
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
                            </>
                          ) : (
                            <button
                              className="ui-button"
                              onClick={() => open({ kind: "complete", row })}
                            >
                              {t.complete}
                            </button>
                          )}
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
      {action?.kind === "link" && (
        <AppointmentLinkDialog
          {...props}
          row={action.row}
          onClose={close}
          onSaved={() => {
            setNotice(true);
            close();
          }}
          returnFocus={returnFocus}
        />
      )}
      {action && action.kind !== "link" && (
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
  action:
    | { kind: "arrive" }
    | {
        kind: "transfer" | "leave" | "start" | "complete";
        row: Attendance;
        previous?: Attendance;
      };
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
  const [previous, setPrevious] = useState(
    action.kind === "start" ? action.previous : undefined,
  );
  const [reviewedPrevious, setReviewedPrevious] = useState<
    Attendance | undefined
  >();
  const visitAction = action.kind === "start" || action.kind === "complete";
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
    !!(
      current &&
      current.status !==
        (action.kind === "complete" ? "with_doctor" : "waiting")
    );
  async function save() {
    if (submitting.current || blocked) return;
    if (
      !visitAction &&
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
          : visitAction
            ? {
                kind: "visit",
                current: current!,
                action:
                  action.kind === "start"
                    ? { kind: "start", previous }
                    : { kind: "complete" },
              }
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
      } else {
        const message = t[error.code as keyof typeof t];
        setIssue(typeof message === "string" ? message : t.failed);
      }
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
    setReviewedPrevious(undefined);
    setAcknowledged(false);
    try {
      const [next, prior] = await Promise.all([
        reviewAttendance(current?.id),
        previous ? reviewAttendance(previous.id) : Promise.resolve(undefined),
      ]);
      setReview(next);
      setReviewedPrevious(prior?.items[0]);
    } catch (error) {
      setReviewFailed(true);
      if (error instanceof ApiError && error.status === 401) onExpired();
    } finally {
      setReviewBusy(false);
    }
  }
  const statusLabel = (status: Attendance["status"]) =>
    status === "completed" ? t.completed : t.attendanceStatuses[status];
  const summary = review && (
    <div aria-label={t.reviewed}>
      {review.items
        .filter((row) => current || row.patient.id === patient?.id)
        .map((row) => (
          <p key={row.id}>
            {row.patient.name} · {row.doctor.name} ·{" "}
            {statusLabel(row.status)}{" "}
            · {arrivalTime(row.arrivedAt, lang)}
          </p>
        ))}
      {!current &&
        !review.items.some((row) => row.patient.id === patient?.id) && (
          <p>{t.reviewEmpty}</p>
        )}
      {reviewedPrevious && (
        <p>
          {t.previousPatient}: {reviewedPrevious.patient.name} ·{" "}
          {statusLabel(reviewedPrevious.status)}
        </p>
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
            if (previous) {
              if (!reviewedPrevious) return;
              setPrevious(
                reviewedPrevious.status === "with_doctor"
                  ? reviewedPrevious
                  : undefined,
              );
            }
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
      {action.kind !== "arrive" && action.kind === "start" && previous && (
        <p>
          {t.previousPatient}: <strong>{previous.patient.name}</strong>
        </p>
      )}
      {!visitAction && action.kind !== "leave" && (
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
      {action.kind === "leave" || visitAction ? (
        <ConfirmDialog
          open
          direction={dir}
          title={
            action.kind === "start"
              ? t.start
              : action.kind === "complete"
                ? t.complete
                : t.leave
          }
          description={
            action.kind === "start"
              ? previous
                ? `${t.previousPatient}: ${previous.patient.name}. ${t.completeDescription}`
                : t.startDescription
              : action.kind === "complete"
                ? t.completeDescription
                : t.leaveDescription
          }
          cancel={t.cancel}
          confirm={
            action.kind === "start"
              ? previous
                ? t.completePrevious
                : t.start
              : action.kind === "complete"
                ? t.complete
                : t.leave
          }
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

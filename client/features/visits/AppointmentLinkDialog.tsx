import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link } from "lucide-react";
import { translations, type Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { EditReview } from "../../ui/EditReview";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import {
  useAppointmentOptions,
  useAppointmentLinkWrite,
  useAppointmentLinkReview,
} from "./queries";
import type { Attendance, AppointmentOptions, AppointmentOption } from "./api";
import { arrivalTime } from "./visits.format";

type Props = {
  row: Attendance;
  lang: Lang;
  onExpired: () => void;
  onClose: () => void;
  onSaved: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export function AppointmentLinkDialog(props: Props) {
  const closeRequest = useRef(props.onClose);
  const query = useAppointmentOptions(props.row, props.onExpired),
    t = translations[props.lang].visits;
  return (
    <Modal
      open
      direction={props.lang === "ar" ? "rtl" : "ltr"}
      title={t.linkAppointment}
      description={t.linkDescription}
      close={t.close}
      trigger={<span />}
      onOpenChange={(open) => {
        if (!open) closeRequest.current();
      }}
      onCloseAutoFocus={(event) => {
        if (props.returnFocus?.current?.isConnected) {
          event.preventDefault();
          props.returnFocus.current.focus();
        }
      }}
    >
      {query.isPending && <p role="status">{t.loading}</p>}
      {query.isError && (
        <p role="alert">{query.blocked ? t.readDenied : t.failed}</p>
      )}
      {!query.online && <p role="status">{t.offline}</p>}
      {query.data && !query.blocked && (
        <LinkEditor
          {...props}
          closeRequest={closeRequest}
          initial={query.data}
          latest={query.data}
          online={query.online}
        />
      )}
    </Modal>
  );
}
function LinkEditor({
  row,
  lang,
  onExpired,
  onClose,
  onSaved,
  onNavigationGuardChange,
  initial,
  latest,
  online,
  closeRequest,
}: Props & {
  closeRequest: RefObject<() => void>;
  initial: AppointmentOptions;
  latest: AppointmentOptions;
  online: boolean;
}) {
  const t = translations[lang].visits,
    dt = translations[lang].editing,
    dir = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const [current, setCurrent] = useState(row),
    [base, setBase] = useState(initial),
    [choice, setChoice] = useState(initial.link.appointmentId ?? "none");
  const [issue, setIssue] = useState(""),
    [recovery, setRecovery] = useState<"conflict" | "uncertain" | null>(null),
    [review, setReview] = useState<{
      row: Attendance;
      options: AppointmentOptions;
    } | null>(null),
    [reviewBusy, setReviewBusy] = useState(false),
    [reviewFailed, setReviewFailed] = useState(false);
  const mutation = useAppointmentLinkWrite(),
    readReview = useAppointmentLinkReview(),
    submitting = useRef(false);
  const selected = base.items.find((item) => item.id === choice),
    latestSelected = latest.items.find((item) => item.id === choice);
  const invalidChoice = choice !== "none" && !selected;
  const busy = mutation.isPending || reviewBusy,
    changed =
      latest.link.editVersion > base.link.editVersion ||
      latest.visitVersion > (current.visit?.editVersion ?? 0) ||
      (row.visit?.editVersion ?? 0) > (current.visit?.editVersion ?? 0) ||
      !!(
        selected &&
        (!latestSelected || latestSelected.editVersion !== selected.editVersion)
      );
  const guard = useDraftGuard(
    issue !== t.readDenied &&
      (choice !== (base.link.appointmentId ?? "none") || !!recovery),
    busy,
    onClose,
    onNavigationGuardChange,
  );
  useEffect(() => {
    closeRequest.current = () => guard.requestLeave(onClose);
    return () => {
      closeRequest.current = onClose;
    };
  }, [closeRequest, guard.requestLeave, onClose]);
  const label = (item: AppointmentOption) =>
    `${arrivalTime(item.startsAt, lang)} · ${item.doctor.name} · ${t.appointmentStatuses[item.status]}`;
  async function reviewServer() {
    if (busy) return;
    setReviewBusy(true);
    setReviewFailed(false);
    try {
      setReview(await readReview(current));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (error instanceof ApiError && error.status === 403)
        setIssue(t.readDenied);
      setReviewFailed(true);
    } finally {
      setReviewBusy(false);
    }
  }
  const blocked =
    busy ||
    !online ||
    !!recovery ||
    changed ||
    invalidChoice ||
    issue === t.readDenied ||
    choice === (base.link.appointmentId ?? "none");
  async function save() {
    if (submitting.current || blocked) return;
    submitting.current = true;
    setIssue("");
    try {
      await mutation.mutateAsync({ row: current, options: base, choice });
      guard.release();
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (error instanceof ApiError && error.status === 403)
        setIssue(t.readDenied);
      else if (error instanceof ApiError && error.status === 409) {
        setRecovery("conflict");
        setReview(null);
      } else if (
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
  if (issue === t.readDenied) return <p role="alert">{t.readDenied}</p>;
  return (
    <>
      <form
        className="visits-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p>
          <strong>{current.patient.name}</strong> · {current.doctor.name}
        </p>
        <p>{t.linkWarning}</p>
        <p>{t.linkIndependent}</p>
        <div className="field">
          <Label htmlFor={id}>{t.appointmentChoice}</Label>
          <SelectField
            id={id}
            direction={dir}
            value={choice}
            onValueChange={setChoice}
            disabled={busy || !!recovery || issue === t.readDenied}
            placeholder={t.appointmentChoice}
            options={[
              { value: "none", label: t.noAppointment },
              ...base.items.map((item) => ({
                value: item.id,
                label: label(item),
              })),
            ]}
          />
        </div>
        {selected && <p>{label(selected)}</p>}
        {selected && selected.doctorId !== current.doctor.id && (
          <p role="status">{t.linkDoctorMismatch}</p>
        )}
        {!base.items.length && <p>{t.noAppointmentOptions}</p>}
        {invalidChoice && <p role="alert">{t.invalidAppointmentChoice}</p>}
        {issue && <p role="alert">{issue}</p>}
        <EditReview
          lang={lang}
          issue={recovery}
          changed={changed}
          busy={busy || !online}
          failed={reviewFailed}
          reviewed={!!review}
          onReview={() => void reviewServer()}
          onAccept={(keep) => {
            if (!review) return;
            setCurrent(review.row);
            setBase(review.options);
            if (!keep) setChoice(review.options.link.appointmentId ?? "none");
            setReview(null);
            setRecovery(null);
            setIssue("");
          }}
        >
          {review && (
            <p>
              {t.appointmentChoice}:{" "}
              {review.options.items.find(
                (item) => item.id === review.options.link.appointmentId,
              )
                ? label(
                    review.options.items.find(
                      (item) => item.id === review.options.link.appointmentId,
                    )!,
                  )
                : t.noAppointment}
            </p>
          )}
        </EditReview>
        <div className="form-actions">
          <button
            type="button"
            className="ui-button"
            disabled={busy}
            onClick={() => guard.requestLeave(onClose)}
          >
            {t.cancel}
          </button>
          <button className="primary action" disabled={blocked}>
            <Link size={16} aria-hidden />
            {busy ? t.loading : t.saveLink}
          </button>
        </div>
      </form>
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

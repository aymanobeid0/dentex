import { useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { translations, type Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { useBooking } from "./queries";

type PatientContext = {
  id: string;
  name: string;
  fileNumber: string;
  archived: boolean;
};
type Props = {
  patient: PatientContext;
  lang: Lang;
  canWrite: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
const emptyDraft = () => ({
  doctorId: "",
  date: "",
  time: "",
  duration: "30",
  note: "",
});
export function BookingAction(props: Props) {
  // The closed action owns no navigation guard or polling subscription.
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const t = translations[props.lang].appointments;
  return (
    <>
      {props.canWrite && (
        <button
          ref={trigger}
          className="language patient-back"
          disabled={props.patient.archived}
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
        >
          <CalendarPlus size={16} aria-hidden />
          {t.book}
        </button>
      )}
      {saved && (
        <p role="status" className="success">
          {t.saved}
        </p>
      )}
      {open && (
        <BookingDialog
          {...props}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setSaved(true);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
function BookingDialog({
  patient,
  lang,
  canWrite,
  onExpired,
  onNavigationGuardChange,
  onClose,
  onSaved,
}: Props & { onClose: () => void; onSaved: () => void }) {
  const t = translations[lang].appointments,
    direction = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const [draft, setDraft] = useState(emptyDraft),
    [issue, setIssue] = useState<keyof typeof t | "">("");
  const submitting = useRef(false);
  const { doctors, mutation } = useBooking(true, canWrite, onExpired);
  const dirty = !!(
    draft.doctorId ||
    draft.date ||
    draft.time ||
    draft.note ||
    draft.duration !== "30" ||
    issue === "uncertain"
  );
  const guard = useDraftGuard(
    dirty,
    mutation.isPending,
    () => setDraft(emptyDraft()),
    onNavigationGuardChange,
  );
  const eligible = doctors.data?.some((doctor) => doctor.id === draft.doctorId);
  const blocked =
    !canWrite ||
    patient.archived ||
    !doctors.online ||
    !doctors.data ||
    doctors.isError ||
    !eligible ||
    issue === "uncertain" ||
    mutation.isPending;
  const change = (key: keyof typeof draft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || submitting.current) return;
    submitting.current = true;
    setIssue("");
    try {
      await mutation.mutateAsync({
        patientId: patient.id,
        doctorId: draft.doctorId,
        date: draft.date,
        time: draft.time,
        durationMinutes: Number(draft.duration),
        administrativeNote: draft.note,
      });
      guard.release();
      onSaved();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) {
        onExpired();
        return;
      }
      if (
        !(error instanceof ApiError) ||
        error.kind === "uncertain" ||
        error.kind === "network" ||
        error.status >= 500 ||
        error.status === 408
      )
        setIssue("uncertain");
      else {
        const messages: Record<string, keyof typeof t> = {
          appointment_overlap: "overlap",
          appointment_in_past: "past",
          doctor_ineligible: "ineligible",
          patient_archived: "archived",
          appointment_reference_not_found: "missing",
          invalid_input: "invalid",
          forbidden: "denied",
          untrusted_origin: "denied",
        };
        setIssue(messages[error.code || ""] || "failed");
      }
    } finally {
      submitting.current = false;
    }
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(value) => {
          if (!value) guard.requestLeave(onClose);
        }}
        trigger={<button hidden>{t.book}</button>}
        title={t.title}
        description={t.hint}
        close={t.close}
        direction={direction}
      >
        <p>
          {patient.name} — <bdi>{patient.fileNumber}</bdi>
        </p>
        {!canWrite && <p role="alert">{t.denied}</p>}
        {patient.archived && <p role="alert">{t.archived}</p>}
        {!doctors.online && <p role="status">{t.offline}</p>}
        {doctors.isPending && doctors.online && (
          <p role="status">{t.loading}</p>
        )}
        {doctors.isError && (
          <p role="alert">{doctors.blocked ? t.denied : t.failed}</p>
        )}
        {doctors.data?.length === 0 && <p role="status">{t.empty}</p>}
        <form
          className="clinic-form booking-form"
          onSubmit={(event) => void submit(event)}
        >
          <div className="field">
            <Label htmlFor={`${id}-doctor`}>{t.doctor}</Label>
            <SelectField
              id={`${id}-doctor`}
              value={draft.doctorId}
              onValueChange={(value) => change("doctorId", value)}
              placeholder={t.choose}
              options={(doctors.data || []).map((doctor) => ({
                value: doctor.id,
                label: doctor.name,
              }))}
              direction={direction}
              disabled={
                mutation.isPending || !canWrite || issue === "uncertain"
              }
              required
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-date`}>{t.date}</Label>
            <input
              id={`${id}-date`}
              type="date"
              required
              value={draft.date}
              onChange={(event) => change("date", event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-time`}>{t.time}</Label>
            <input
              id={`${id}-time`}
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder="HH:MM"
              pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
              maxLength={5}
              required
              value={draft.time}
              onChange={(event) => change("time", event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="field">
            <Label htmlFor={`${id}-duration`}>{t.duration}</Label>
            <input
              id={`${id}-duration`}
              type="number"
              min="5"
              max="240"
              step="5"
              required
              value={draft.duration}
              onChange={(event) => change("duration", event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="field wide">
            <Label htmlFor={`${id}-note`}>{t.note}</Label>
            <textarea
              id={`${id}-note`}
              maxLength={2000}
              value={draft.note}
              onChange={(event) => change("note", event.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          {issue && (
            <p className="error wide" role="alert">
              {t[issue]}
            </p>
          )}
          {draft.doctorId && doctors.data && !eligible && (
            <p role="alert">{t.ineligible}</p>
          )}
          <div className="wide">
            <button className="primary action" disabled={blocked}>
              {mutation.isPending ? t.saving : t.save}
            </button>
          </div>
        </form>
        {canWrite && (
          <button
            className="language"
            disabled={
              !doctors.online || doctors.isFetching || mutation.isPending
            }
            onClick={() => void doctors.refetch()}
          >
            {t.retry}
          </button>
        )}
      </Modal>
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
    </>
  );
}

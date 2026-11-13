import { DateField, TimeField } from "../../ui/DateTimeField";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CalendarPlus, Check, UserRound } from "lucide-react";
import { translations, type Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { useBooking } from "./queries";
import { PatientPicker } from "./PatientPicker";

type PatientContext = {
  id: string;
  name: string;
  fileNumber: string;
  archived: boolean;
};
type Props = {
  renderPatientRegistration?: PatientRegistrationSlot;
  canRegisterPatient?: boolean;
  patient?: PatientContext;
  lang: Lang;
  canWrite: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export type PatientRegistrationSlot = (props: {
  onRegistered: (patient: {
    id: string;
    name: string;
    fileNumber: string;
    archived: false;
  }) => void;
  onCancel: () => void;
  onNavigationGuardChange: (guard: NavigationGuard | null) => void;
}) => ReactNode;
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
          className="primary action"
          aria-label={t.book}
          disabled={props.patient?.archived}
          onClick={() => {
            setSaved(false);
            setOpen(true);
          }}
        >
          <CalendarPlus size={16} aria-hidden />
          <span className="ui-text-desktop">{t.book}</span>
          <span className="ui-text-mobile">{t.bookCompact}</span>
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
  renderPatientRegistration,
  canRegisterPatient,
}: Props & { onClose: () => void; onSaved: () => void }) {
  const t = translations[lang].appointments,
    direction = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const [draft, setDraft] = useState(emptyDraft),
    [issue, setIssue] = useState<keyof typeof t | "">("");
  const [chosen, setChosen] = useState<PatientContext | undefined>(patient);
  const [registering, setRegistering] = useState(false);
  const registrationGuard = useRef<NavigationGuard | null>(null),
    registrationTrigger = useRef<HTMLInputElement>(null),
    wasRegistering = useRef(false);
  const registerGuard = useCallback((value: NavigationGuard | null) => {
    registrationGuard.current = value;
  }, []);
  useLayoutEffect(() => {
    if (wasRegistering.current && !registering)
      registrationTrigger.current?.focus();
    wasRegistering.current = registering;
  }, [registering]);
  const submitting = useRef(false);
  const { doctors, mutation } = useBooking(!registering, canWrite, onExpired);
  const dirty = !!(
    (!patient && chosen) ||
    draft.doctorId ||
    draft.date ||
    draft.time ||
    draft.note ||
    draft.duration !== "30" ||
    issue === "uncertain"
  );
  const guard = useDraftGuard(dirty, mutation.isPending, () =>
    setDraft(emptyDraft()),
  );
  const requestLeave = useCallback<NavigationGuard>(
    (leave, stay) => {
      if (registrationGuard.current)
        registrationGuard.current(() => guard.requestLeave(leave, stay), stay);
      else guard.requestLeave(leave, stay);
    },
    [guard.requestLeave],
  );
  useEffect(() => {
    onNavigationGuardChange?.(requestLeave);
    return () => onNavigationGuardChange?.(null);
  }, [onNavigationGuardChange, requestLeave]);
  const eligible = doctors.data?.some((doctor) => doctor.id === draft.doctorId);
  const blocked =
    !canWrite ||
    !chosen ||
    !draft.date ||
    !draft.time ||
    chosen.archived ||
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
        patientId: chosen!.id,
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
        size="wide"
        headerIcon={<CalendarPlus size={18} aria-hidden />}
        footer={
          !registering ? (
            <footer className="ui-dialog-footer">
              <span className="ui-dialog-summary">
                {t.hint}
                {draft.date && (
                  <strong>
                    <bdi>
                      {draft.date} · {draft.time}
                    </bdi>
                  </strong>
                )}
              </span>
              <button
                type="button"
                className="ui-button"
                onClick={() => requestLeave(onClose)}
              >
                {t.cancel}
              </button>
              <button
                form={`${id}-booking`}
                className="primary action"
                disabled={blocked}
              >
                <Check size={15} aria-hidden />
                {mutation.isPending ? t.saving : t.save}
              </button>
            </footer>
          ) : undefined
        }
        open
        onOpenChange={(value) => {
          if (!value) requestLeave(onClose);
        }}
        trigger={<button hidden>{t.book}</button>}
        title={t.title}
        description={t.hint}
        close={t.close}
        direction={direction}
      >
        <div className="ui-dialog-body" hidden={!registering}>
          {registering &&
            renderPatientRegistration?.({
              onRegistered: (value) => {
                setChosen(value);
                setRegistering(false);
              },
              onCancel: () => setRegistering(false),
              onNavigationGuardChange: registerGuard,
            })}
        </div>
        <div className="ui-dialog-body" hidden={registering}>
          <div className="booking-patient-heading">
            <Label>{t.patient}</Label>
          </div>
          {patient ? (
            <div className="ui-selected-person">
              <span className="ui-person-avatar">
                <UserRound size={16} aria-hidden />
              </span>
              <strong>{patient.name}</strong>
              <bdi>{patient.fileNumber}</bdi>
            </div>
          ) : (
            <PatientPicker
              key={chosen?.id || "search"}
              inputRef={registrationTrigger}
              onRegister={
                canRegisterPatient && renderPatientRegistration
                  ? () => setRegistering(true)
                  : undefined
              }
              lang={lang}
              canWrite={canWrite}
              disabled={
                registering || mutation.isPending || issue === "uncertain"
              }
              selected={chosen}
              onSelect={setChosen}
              onExpired={onExpired}
            />
          )}
          {!canWrite && <p role="alert">{t.denied}</p>}
          {chosen?.archived && <p role="alert">{t.archived}</p>}
          {!doctors.online && <p role="status">{t.offline}</p>}
          {doctors.isPending && doctors.online && (
            <p role="status">{t.loading}</p>
          )}
          {doctors.isError && (
            <p role="alert">{doctors.blocked ? t.denied : t.failed}</p>
          )}
          {doctors.data?.length === 0 && <p role="status">{t.empty}</p>}
          <form
            id={`${id}-booking`}
            className="clinic-form booking-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="field">
              <Label htmlFor={`${id}-doctor`}>{t.doctor}</Label>
              <SelectField
                id={`${id}-doctor`}
                value={draft.doctorId}
                onValueChange={(value) => change("doctorId", value)}
                direction={direction}
                placeholder={t.choose}
                options={(doctors.data || []).map((doctor) => ({
                  value: doctor.id,
                  label: doctor.name,
                }))}
                required
                disabled={
                  mutation.isPending ||
                  !canWrite ||
                  issue === "uncertain" ||
                  !doctors.data?.length ||
                  doctors.isError ||
                  !doctors.online
                }
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
                required
                value={draft.duration}
                onChange={(event) => change("duration", event.target.value)}
                disabled={mutation.isPending}
              />
            </div>
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
            {issue && (
              <p className="error wide" role="alert">
                {t[issue]}
              </p>
            )}
            {draft.doctorId && doctors.data && !eligible && (
              <p role="alert">{t.ineligible}</p>
            )}
          </form>
          {canWrite && (doctors.isError || !doctors.online || !!issue) && (
            <button
              className="ui-button"
              disabled={
                !doctors.online || doctors.isFetching || mutation.isPending
              }
              onClick={() => void doctors.refetch()}
            >
              {t.retry}
            </button>
          )}
        </div>
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

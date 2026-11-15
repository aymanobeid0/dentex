import { useId, useRef, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import type { Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { SelectField } from "../../ui/SelectField";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { useProcedureWrite, useVisitTreatments } from "./treatments.queries";
import type {
  TreatmentProcedure,
  TreatmentItem,
  ProcedureCommand,
} from "./treatments.api";
import { treatmentCopy } from "./treatments.copy";
import { procedureCopy } from "./procedures.copy";
import { arrivalTime } from "./visits.format";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "../../ui/Disclosure";
import type { TreatmentPlan } from "./treatments.api";
type Props = {
  attendanceId: string;
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
  label?: string;
};
export function VisitTreatments(props: Props) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button ref={trigger} className="ui-button" onClick={() => setOpen(true)}>
        <ClipboardList size={16} aria-hidden />
        {props.label ?? procedureCopy[props.lang].title}
      </button>
      {open && (
        <VisitTreatmentDialog
          {...props}
          onClose={() => setOpen(false)}
          returnFocus={trigger}
        />
      )}
    </>
  );
}
function VisitTreatmentDialog({
  attendanceId,
  lang,
  onExpired,
  onNavigationGuardChange,
  onClose,
  returnFocus,
}: Props & {
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = treatmentCopy[lang],
    p = procedureCopy[lang],
    dir = lang === "ar" ? "rtl" : "ltr",
    id = useId(),
    query = useVisitTreatments(attendanceId, onExpired),
    write = useProcedureWrite(),
    sending = useRef(false);
  const [draft, setDraft] = useState<{
      id: string;
      visitVersion: number;
      item?: TreatmentItem;
      description: string;
      location: string;
      notes: string;
    } | null>(null),
    [voiding, setVoiding] = useState<TreatmentProcedure | null>(null),
    [reason, setReason] = useState("");
  const [issue, setIssue] = useState<
      "conflict" | "uncertain" | "rejected" | null
    >(null),
    [reviewed, setReviewed] = useState(false);
  const clear = () => {
    setDraft(null);
    setVoiding(null);
    setReason("");
    setIssue(null);
    setReviewed(false);
  };
  const guard = useDraftGuard(
    !!draft || !!voiding,
    write.isPending,
    clear,
    onNavigationGuardChange,
  );
  const recordingChanged =
    !!draft &&
    !!query.data &&
    (query.data.visitVersion !== draft.visitVersion ||
      !query.data.canRecord ||
      (!!draft.item &&
        !query.data.plans.some(
          (plan) =>
            plan.status === "active" &&
            plan.items.some(
              (item) =>
                item.id === draft.item!.id &&
                item.editVersion === draft.item!.editVersion &&
                item.status === "pending" &&
                !item.procedure,
            ),
        )));
  const changed =
    recordingChanged ||
    (!!voiding &&
      !!query.data &&
      query.data.items.find((row) => row.id === voiding.id)?.editVersion !==
        voiding.editVersion);
  const choices =
    query.data?.plans.flatMap((plan) =>
      plan.status === "active"
        ? plan.items
            .filter((item) => item.status === "pending" && !item.procedure)
            .map((item) => ({
              item,
              label: `${plan.title} · ${item.description}${item.location ? ` · ${item.location}` : ""}`,
            }))
        : [],
    ) ?? [];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      sending.current ||
      write.isPending ||
      !query.online ||
      query.blocked ||
      changed ||
      issue === "conflict" ||
      issue === "uncertain"
    )
      return;
    sending.current = true;
    let command: ProcedureCommand;
    if (voiding)
      command = {
        kind: "void",
        id: voiding.id,
        editVersion: voiding.editVersion,
        reason,
      };
    else if (draft)
      command = {
        kind: "record",
        attendanceId,
        input: {
          id: draft.id,
          visitVersion: draft.visitVersion,
          notes: draft.notes,
          ...(draft.item
            ? {
                source: "plan",
                itemId: draft.item.id,
                itemVersion: draft.item.editVersion,
              }
            : {
                source: "standalone",
                description: draft.description,
                location: draft.location,
              }),
        },
      };
    else {
      sending.current = false;
      return;
    }
    try {
      await write.mutateAsync(command);
      guard.release();
      clear();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      setIssue(
        error instanceof ApiError && error.code === "edit_conflict"
          ? "conflict"
          : !(error instanceof ApiError) ||
              error.kind === "uncertain" ||
              error.status >= 500 ||
              error.status === 408
            ? "uncertain"
            : "rejected",
      );
      setReviewed(false);
    } finally {
      sending.current = false;
    }
  }
  const leave = (next: () => void) => {
    if (
      issue === "uncertain" &&
      (!reviewed || !query.isSuccess || query.isFetching || query.isError)
    )
      return;
    guard.requestLeave(next);
  };
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) leave(onClose);
        }}
        trigger={null}
        title={p.title}
        description={p.independent}
        close={t.close}
        direction={dir}
        size="wide"
        headerIcon={<ClipboardList size={20} />}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <div className="ui-dialog-body treatment-visit-body">
          <div className="visits-actions">
            <button
              className="ui-button"
              disabled={query.isFetching || !query.online}
              onClick={() => {
                setReviewed(true);
                void query.refetch();
              }}
            >
              {t.refresh}
            </button>
            {query.data?.canRecord && !draft && !voiding && (
              <button
                className="primary action"
                disabled={!query.online || query.blocked}
                onClick={() =>
                  setDraft({
                    id: crypto.randomUUID(),
                    visitVersion: query.data!.visitVersion,
                    description: "",
                    location: "",
                    notes: "",
                  })
                }
              >
                <Plus size={16} aria-hidden />
                {p.record}
              </button>
            )}
          </div>
          {!query.online && <p role="status">{t.offline}</p>}
          {query.isPending && query.online && <p role="status">{t.loading}</p>}
          {query.isError && <p role="alert">{t.failed}</p>}
          {issue && <p role="alert">{t[issue]}</p>}
          {changed && <p role="alert">{t.conflict}</p>}
          {query.data && !query.blocked && (
            <>
              {!query.data.canRecord && <p role="status">{p.closed}</p>}
              {draft && (
                <form className="visits-form" onSubmit={save}>
                  <div className="field">
                    <Label htmlFor={id + "choice"}>{p.choice}</Label>
                    <SelectField
                      id={id + "choice"}
                      direction={dir}
                      value={draft.item?.id ?? "standalone"}
                      disabled={write.isPending || !!issue || changed}
                      onValueChange={(value) =>
                        setDraft({
                          ...draft,
                          item: choices.find((x) => x.item.id === value)?.item,
                        })
                      }
                      placeholder={p.choice}
                      options={[
                        { value: "standalone", label: p.standalone },
                        ...choices.map((x) => ({
                          value: x.item.id,
                          label: x.label,
                        })),
                      ]}
                    />
                  </div>
                  {draft.item ? (
                    <p>
                      {draft.item.description} · {draft.item.location}
                    </p>
                  ) : (
                    <>
                      <div className="field">
                        <Label htmlFor={id + "description"}>
                          {p.performed}
                        </Label>
                        <input
                          className="ui-input"
                          id={id + "description"}
                          required
                          maxLength={200}
                          disabled={write.isPending}
                          value={draft.description}
                          onChange={(e) =>
                            setDraft({ ...draft, description: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <Label htmlFor={id + "location"}>{t.location}</Label>
                        <input
                          className="ui-input"
                          id={id + "location"}
                          maxLength={80}
                          disabled={write.isPending}
                          value={draft.location}
                          onChange={(e) =>
                            setDraft({ ...draft, location: e.target.value })
                          }
                        />
                      </div>
                    </>
                  )}
                  <div className="field">
                    <Label htmlFor={id + "notes"}>{t.notes}</Label>
                    <textarea
                      className="ui-textarea"
                      id={id + "notes"}
                      maxLength={2000}
                      disabled={write.isPending}
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft({ ...draft, notes: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="ui-button"
                      disabled={write.isPending}
                      onClick={() => leave(clear)}
                    >
                      {p.cancel}
                    </button>
                    <button
                      className="primary action"
                      disabled={
                        write.isPending ||
                        !query.online ||
                        query.blocked ||
                        changed ||
                        !!issue ||
                        changed
                      }
                    >
                      {t.save}
                    </button>
                  </div>
                </form>
              )}
              {voiding && (
                <form className="visits-form" onSubmit={save}>
                  <p>
                    <strong>{voiding.description}</strong> · {voiding.location}
                  </p>
                  <div className="field">
                    <Label htmlFor={id + "reason"}>{p.reason}</Label>
                    <textarea
                      className="ui-textarea"
                      id={id + "reason"}
                      required
                      maxLength={500}
                      disabled={write.isPending}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="ui-button"
                      disabled={write.isPending}
                      onClick={() => leave(clear)}
                    >
                      {p.cancel}
                    </button>
                    <button
                      className="primary action"
                      disabled={
                        write.isPending ||
                        !query.online ||
                        query.blocked ||
                        !!issue ||
                        changed
                      }
                    >
                      {t.save}
                    </button>
                  </div>
                </form>
              )}
              {!query.data.items.length && <p>{p.empty}</p>}
              <ol className="visits-list">
                {query.data.items.map((row) => (
                  <li key={row.id}>
                    <div className="visits-person">
                      <strong>{row.description}</strong>
                      {row.location && (
                        <span>
                          {t.location}: <bdi>{row.location}</bdi>
                        </span>
                      )}
                      <span
                        className={
                          "badge " +
                          (row.voidedAt ? "badge-neutral" : "badge-success")
                        }
                      >
                        {row.voidedAt ? p.voided : t.completed}
                      </span>
                      {row.itemId && (
                        <ProcedurePlanReference
                          record={row}
                          plans={query.data!.plans}
                          lang={lang}
                        />
                      )}
                      <span>
                        {p.doctor}: {row.visit.doctorName}
                      </span>
                      <span>
                        {p.actor}: {row.actorName} ·{" "}
                        {arrivalTime(row.recordedAt, lang)}
                      </span>
                      {row.notes && <p>{row.notes}</p>}
                      {row.voidedAt && (
                        <>
                          <span>
                            {p.voidedBy}: {row.voidActorName} ·{" "}
                            {arrivalTime(row.voidedAt, lang)}
                          </span>
                          <p>{row.voidReason}</p>
                        </>
                      )}
                    </div>
                    {!row.voidedAt && !draft && !voiding && (
                      <button
                        className="ui-button"
                        disabled={!query.online}
                        onClick={() => setVoiding(row)}
                      >
                        {p.void}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <section>
                <h3>{p.planned}</h3>
                {choices.length ? (
                  <ol>
                    {choices.map(({ item, label }) => (
                      <li key={item.id}>{label}</li>
                    ))}
                  </ol>
                ) : (
                  <p>{p.noPending}</p>
                )}
              </section>
            </>
          )}
        </div>
      </Modal>
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={dir}
        title={t.draftTitle}
        description={issue === "uncertain" ? t.uncertain : t.draftDescription}
        stay={t.stay}
        discard={t.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
    </>
  );
}
function ProcedurePlanReference({
  record,
  plans,
  lang,
}: {
  record: TreatmentProcedure;
  plans: TreatmentPlan[];
  lang: Lang;
}) {
  const plan = plans.find((plan) =>
      plan.items.some((item) => item.id === record.itemId),
    ),
    t = treatmentCopy[lang],
    p = procedureCopy[lang];
  if (!plan) return null;
  return (
    <Disclosure>
      <DisclosureTrigger className="ui-button">
        {p.linked} · {plan.title}
      </DisclosureTrigger>
      <DisclosureContent>
        <h4>
          {plan.title} · {t[plan.status]}
        </h4>
        {plan.notes && <p>{plan.notes}</p>}
        <ol>
          {plan.items.map((item) => (
            <li key={item.id}>
              <strong>{item.description}</strong> · {item.location} ·{" "}
              {item.procedure ? t.completed : t[item.status]}
              {item.id === record.itemId && <span> · {p.linked}</span>}
              {item.notes && <p>{item.notes}</p>}
            </li>
          ))}
        </ol>
      </DisclosureContent>
    </Disclosure>
  );
}

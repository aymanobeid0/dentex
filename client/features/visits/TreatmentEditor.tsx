import { useId, useRef, useState } from "react";
import type { Lang } from "../../shared/i18n";
import { ApiError } from "../../shared/api/request";
import { Modal } from "../../ui/Modal";
import { Label } from "../../ui/Label";
import { useDraftGuard, type NavigationGuard } from "../../ui/useDraftGuard";
import { DiscardDraftDialog } from "../../ui/DiscardDraftDialog";
import { useTreatmentWrite, useTreatmentPlans } from "./treatments.queries";
import type { TreatmentPlan, TreatmentItem } from "./treatments.api";
import { treatmentCopy } from "./treatments.copy";
export type TreatmentEdit = {
  plan?: TreatmentPlan;
  item?: TreatmentItem;
  kind: "plan" | "item" | "status";
};
export function TreatmentEditor({
  choice,
  patientId,
  lang,
  onClose,
  onExpired,
  onNavigationGuardChange,
}: {
  choice: TreatmentEdit;
  patientId: string;
  lang: Lang;
  onClose: () => void;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const t = treatmentCopy[lang],
    dir = lang === "ar" ? "rtl" : "ltr",
    id = useId();
  const { plan, item, kind } = choice;
  const [name, setName] = useState(
      item?.description ?? (kind === "plan" ? plan?.title : "") ?? "",
    ),
    [notes, setNotes] = useState(
      item?.notes ?? (kind === "plan" ? plan?.notes : "") ?? "",
    ),
    [location, setLocation] = useState(item?.location ?? ""),
    [reason, setReason] = useState("");
  const [issue, setIssue] = useState<
      "conflict" | "uncertain" | "rejected" | null
    >(null),
    [reviewed, setReviewed] = useState(false);
  const newId = useRef(crypto.randomUUID()),
    sending = useRef(false),
    write = useTreatmentWrite(),
    review = useTreatmentPlans(patientId, onExpired, false);
  const latestPlan = review.data?.items.find((row) => row.id === plan?.id);
  const changed =
    !!plan &&
    !!review.data &&
    (!latestPlan ||
      latestPlan.status !== plan.status ||
      (item
        ? latestPlan.items.find((row) => row.id === item.id)?.editVersion !==
          item.editVersion
        : latestPlan.editVersion !== plan.editVersion));
  const originalName =
      item?.description ?? (kind === "plan" ? plan?.title : "") ?? "",
    originalNotes = item?.notes ?? (kind === "plan" ? plan?.notes : "") ?? "";
  const dirty =
    name !== originalName ||
    notes !== originalNotes ||
    location !== (item?.location ?? "") ||
    !!reason ||
    !!issue;
  const guard = useDraftGuard(
    dirty,
    write.isPending,
    () => {
      setName(originalName);
      setNotes(originalNotes);
      setLocation(item?.location ?? "");
      setReason("");
      setIssue(null);
    },
    onNavigationGuardChange,
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (
      sending.current ||
      write.isPending ||
      !review.online ||
      issue === "conflict" ||
      issue === "uncertain" ||
      changed
    )
      return;
    sending.current = true;
    let path: string,
      body: object,
      method = "PATCH";
    if (kind === "status") {
      path = item
        ? `/treatment-items/${item.id}`
        : `/treatment-plans/${plan!.id}`;
      body = {
        kind: "status",
        editVersion: item?.editVersion ?? plan!.editVersion,
        status: item
          ? item.status === "pending"
            ? "cancelled"
            : "pending"
          : plan!.status === "active"
            ? "cancelled"
            : "active",
        reason,
      };
    } else if (kind === "plan") {
      path = plan
        ? `/treatment-plans/${plan.id}`
        : `/patient/${patientId}/treatment-plans`;
      method = plan ? "PATCH" : "POST";
      body = plan
        ? { kind: "edit", editVersion: plan.editVersion, title: name, notes }
        : { id: newId.current, title: name, notes };
    } else {
      path = item
        ? `/treatment-items/${item.id}`
        : `/treatment-plans/${plan!.id}/items`;
      method = item ? "PATCH" : "POST";
      body = item
        ? {
            kind: "edit",
            editVersion: item.editVersion,
            description: name,
            notes,
            location,
          }
        : {
            id: newId.current,
            editVersion: plan!.editVersion,
            description: name,
            notes,
            location,
          };
    }
    try {
      await write.mutateAsync({ path, body, method });
      guard.release();
      onClose();
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
    } finally {
      sending.current = false;
    }
  }
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (
            issue === "uncertain" &&
            (!reviewed ||
              !review.isSuccess ||
              review.isFetching ||
              review.isError)
          )
            return;
          if (!open) guard.requestLeave(onClose);
        }}
        trigger={null}
        title={
          kind === "status"
            ? t.reason
            : kind === "plan"
              ? t.planName
              : t.addItem
        }
        description={t.title}
        close={t.close}
        direction={dir}
      >
        {changed && <p role="alert">{t.conflict}</p>}
        <form className="clinic-form" onSubmit={save}>
          <div aria-busy={write.isPending}>
            {kind === "status" ? (
              <div className="field">
                <Label htmlFor={id + "reason"}>{t.reason}</Label>
                <textarea
                  className="ui-textarea"
                  disabled={write.isPending}
                  id={id + "reason"}
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <Label htmlFor={id + "name"}>
                    {kind === "plan" ? t.planName : t.description}
                  </Label>
                  <input
                    className="ui-input"
                    disabled={write.isPending}
                    id={id + "name"}
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                {kind === "item" && (
                  <div className="field">
                    <Label htmlFor={id + "location"}>{t.location}</Label>
                    <input
                      className="ui-input"
                      disabled={write.isPending}
                      id={id + "location"}
                      maxLength={80}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                )}
                <div className="field">
                  <Label htmlFor={id + "notes"}>{t.notes}</Label>
                  <textarea
                    className="ui-textarea"
                    disabled={write.isPending}
                    id={id + "notes"}
                    maxLength={2000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          {!review.online && <p role="status">{t.offline}</p>}
          {issue && (
            <div role="alert">
              <p>{t[issue]}</p>
              <button
                type="button"
                className="ui-button"
                disabled={review.isFetching || !review.online}
                onClick={() => {
                  setReviewed(true);
                  void review.refetch();
                }}
              >
                {t.refresh}
              </button>
            </div>
          )}
          {reviewed && review.data && (
            <section aria-label={t.refresh}>
              {review.data.items.map((row) => (
                <p key={row.id}>
                  {row.title} · {row.items.map((i) => i.description).join("، ")}
                </p>
              ))}
            </section>
          )}
          {reviewed && review.isError && <p role="alert">{t.failed}</p>}
          <button
            className="primary action"
            disabled={
              write.isPending ||
              !review.online ||
              issue === "conflict" ||
              issue === "uncertain" ||
              changed
            }
          >
            {t.save}
          </button>
        </form>
      </Modal>
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={dir}
        title={t.draftTitle}
        description={t.draftDescription}
        stay={t.stay}
        discard={t.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
    </>
  );
}

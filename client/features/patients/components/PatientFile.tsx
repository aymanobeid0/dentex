import { Archive, Pencil, RotateCcw } from "lucide-react";
import { Hint } from "../../../ui/Hint";
import { nameInitials } from "../../../ui/nameInitials";
import type { usePatientsPage } from "../hooks/usePatientsPage";
type Props = Pick<
  ReturnType<typeof usePatientsPage>,
  "lang" | "t" | "patient"
> & {
  canWrite?: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
};
export function PatientFile({
  lang,
  t,
  patient,
  canWrite,
  onEdit,
  onArchive,
}: Props) {
  if (!patient) return null;
  const initials = nameInitials(patient.name);

  return (
    <article className="card patient-file">
      <header className="patient-identity">
        <span className="patient-avatar" aria-hidden="true">
          {initials}
        </span>
        <div className="patient-identity-meta">
          <div className="patient-title-row">
            <h2>{patient.name}</h2>
            <span
              className={
                "badge " +
                (patient.archived ? "badge-neutral" : "badge-success")
              }
            >
              <span className="badge-dot" aria-hidden="true" />
              {patient.archived ? t.archived : t.active}
            </span>
            {patient.isChild && (
              <span className="patient-child badge badge-primary">
                {t.child}
              </span>
            )}
          </div>
          <div className="patient-meta-row">
            <span>
              {t.number}: <bdi>{patient.fileNumber}</bdi>
            </span>
          </div>
        </div>
        {canWrite && (onEdit || onArchive) && (
          <div className="patient-file-actions">
            {!patient.archived && onEdit && (
              <Hint text={t.edit}>
                <button
                  type="button"
                  className="icon-btn hover-primary"
                  aria-label={t.edit}
                  onClick={onEdit}
                >
                  <Pencil size={15} aria-hidden />
                </button>
              </Hint>
            )}
            {onArchive && (
              <Hint text={patient.archived ? t.restore : t.archive}>
                <button
                  type="button"
                  className={
                    "icon-btn " +
                    (patient.archived ? "soft-success" : "hover-warning")
                  }
                  aria-label={patient.archived ? t.restore : t.archive}
                  onClick={onArchive}
                >
                  {patient.archived ? (
                    <RotateCcw size={15} aria-hidden />
                  ) : (
                    <Archive size={15} aria-hidden />
                  )}
                </button>
              </Hint>
            )}
          </div>
        )}
      </header>
      <dl className="patient-data">
        {(
          [
            "phone",
            "gender",
            "birthDate",
            "address",
            "administrativeNote",
            "isChild",
          ] as const
        ).map((key) => (
          <div key={key} className="patient-data-item">
            <dt>{key === "isChild" ? t.child : t[key]}</dt>
            <dd>
              {key === "phone" ? (
                <bdi dir="ltr">{patient.phone}</bdi>
              ) : key === "gender" ? (
                t[patient.gender === "male" ? "male" : "female"]
              ) : key === "isChild" ? (
                t[patient.isChild ? "yes" : "no"]
              ) : key === "birthDate" && patient.birthDate ? (
                <bdi>
                  {new Intl.DateTimeFormat(
                    lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR",
                    { dateStyle: "long", timeZone: "UTC" },
                  ).format(new Date(patient.birthDate + "T00:00:00.000Z"))}
                </bdi>
              ) : (
                patient[key] || t.none
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

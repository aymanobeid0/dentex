import { UserRound } from "lucide-react";
import type { usePatientsPage } from "../hooks/usePatientsPage";
type Props = Pick<ReturnType<typeof usePatientsPage>, "lang" | "t" | "patient">;
export function PatientFile({ lang, t, patient }: Props) {
  if (!patient) return null;

  return (
    <article className="card patient-file">
      <header className="patient-identity">
        <span className="patient-avatar">
          <UserRound size={24} aria-hidden />
        </span>
        <div>
          <h2>{patient.name}</h2>
          <span>
            {t.number}: <bdi>{patient.fileNumber}</bdi>
            {patient.isChild && (
              <>
                {" "}
                · <span className="patient-child">{t.child}</span>
              </>
            )}
          </span>
          <p className="patient-hint">
            {patient.archived ? t.archived : t.active}
          </p>
        </div>
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
          <div key={key}>
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

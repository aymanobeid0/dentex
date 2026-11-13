import { translations, type Lang } from "../../shared/i18n";
import type { AppointmentRow, AppointmentStatus } from "./api";

export const statusKey = {
  booked: "booked",
  attended: "attended",
  absent: "noShow",
  cancelled: "cancelled",
} as const;
export const statusTone: Record<AppointmentStatus, string> = {
  booked: "success",
  attended: "primary",
  absent: "neutral",
  cancelled: "danger",
};
const timeFormats = {
  ar: new Intl.DateTimeFormat("ar-MR-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Nouakchott",
  }),
  fr: new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Nouakchott",
  }),
};
const dateFormats = {
  ar: new Intl.DateTimeFormat("ar-MR-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
    timeZone: "Africa/Nouakchott",
  }),
  fr: new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
    timeZone: "Africa/Nouakchott",
  }),
};
export function appointmentTime(value: string, lang: Lang) {
  return timeFormats[lang].format(new Date(value));
}
export function appointmentDate(value: string, lang: Lang) {
  return dateFormats[lang].format(new Date(value));
}
export function AppointmentTable({
  items,
  lang,
  onOpen,
  showDate = false,
}: {
  items: AppointmentRow[];
  lang: Lang;
  onOpen: (id: string) => void;
  showDate?: boolean;
}) {
  const t = translations[lang].appointments;
  return (
    <div className="table-scroll">
      <table className="appointment-table">
        <thead>
          <tr>
            {showDate && <th scope="col">{t.date}</th>}
            <th scope="col">{t.timeRange}</th>
            <th scope="col">{t.patient}</th>
            <th scope="col">{t.fileNumber}</th>
            <th scope="col">{t.doctor}</th>
            <th scope="col">{t.status}</th>
            <th scope="col">{t.details}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {showDate && (
                <td>
                  <bdi>{appointmentDate(item.startsAt, lang)}</bdi>
                </td>
              )}
              <td>
                <bdi dir="ltr">
                  {appointmentTime(item.startsAt, lang)} –{" "}
                  {appointmentTime(item.endsAt, lang)}
                </bdi>
              </td>
              <td>
                {item.patient.name}
                {item.patient.archived && (
                  <p className="error">{t.archivedWarning}</p>
                )}
              </td>
              <td>
                <bdi>{item.patient.fileNumber}</bdi>
              </td>
              <td>
                {item.doctor.name}
                {!item.doctor.eligible && (
                  <p className="error">{t.doctorWarning}</p>
                )}
              </td>
              <td>
                <span className={`badge badge-${statusTone[item.status]}`}>
                  {t[statusKey[item.status]]}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => onOpen(item.id)}
                  aria-label={`${t.details}: ${item.patient.name} ${appointmentTime(item.startsAt, lang)}`}
                >
                  {t.details}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

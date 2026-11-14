import type { Attendance } from "./api";
import { translations, type Lang } from "../../shared/i18n";
import { arrivalTime } from "./visits.format";

export function AppointmentReference({
  row,
  lang,
}: {
  row: Attendance;
  lang: Lang;
}) {
  const appointment = row.visit?.appointmentLink?.appointment,
    t = translations[lang].visits;
  if (!appointment) return null;
  return (
    <span>
      {t.appointmentChoice}: {arrivalTime(appointment.startsAt, lang)} ·{" "}
      {appointment.doctor.name} · {t.appointmentStatuses[appointment.status]}
    </span>
  );
}

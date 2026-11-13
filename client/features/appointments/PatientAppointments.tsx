import { useState } from "react";
import { translations } from "../../shared/i18n";
import { BookingAction } from "./BookingAction";
import { AppointmentResults } from "./AppointmentResults";
import type { AppointmentsPageProps } from "./AppointmentsPage";

export function PatientAppointments(
  props: AppointmentsPageProps & {
    patient: {
      id: string;
      name: string;
      fileNumber: string;
      archived: boolean;
    };
  },
) {
  const [page, setPage] = useState(1);
  return (
    <section className="patient-appointments">
      <div className="content-heading">
        <h2>{translations[props.lang].appointments.patientAppointments}</h2>
        <div className="appointment-heading-action">
          <BookingAction {...props} />
        </div>
      </div>
      {
        <AppointmentResults
          showNoReadHint={false}
          filter={{ patientId: props.patient.id, page }}
          lang={props.lang}
          canRead={props.canRead}
          canWrite={props.canWrite}
          onNavigationGuardChange={props.onNavigationGuardChange}
          onExpired={props.onExpired}
          onPage={setPage}
        />
      }
    </section>
  );
}

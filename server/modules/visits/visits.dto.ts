import type { ActorAccess } from "../../shared/actor";
import type {
  AppointmentsOperations,
  AppointmentVisitLink,
} from "../appointments";
import type {
  PatientsOperations,
  AttendancePatientReference,
} from "../patients";
import type {
  EmployeesOperations,
  AttendanceDoctorReference,
} from "../employees";
export type AttendanceStatus =
  "waiting" | "left_before_entry" | "with_doctor" | "completed" | "auto_closed";
export interface VisitRecord {
  id: string;
  attendanceId: string;
  patientId: string;
  doctorId: string;
  status:
    "in_progress" | "completed" | "auto_closed" | "entry_recorded_in_error";
  startedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
  appointmentLink?: AppointmentVisitLink;
}
export type CorrectionState = {
  status: AttendanceStatus;
  recordedEndAt: string | null;
  visit?: {
    id: string;
    status: VisitRecord["status"];
    recordedEndAt: string | null;
  };
};
export interface CorrectionRecord {
  id: string;
  kind: string;
  actorId: string;
  reason: string | null;
  recordedAt: string;
  before: CorrectionState;
  after: CorrectionState;
}
export type AttendanceVisit = Omit<
  VisitRecord,
  "attendanceId" | "patientId" | "doctorId"
>;
export interface AttendanceRecord {
  id: string;
  patientId: string;
  doctorId: string;
  status: AttendanceStatus;
  arrivedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
  visit?: AttendanceVisit;
  invalidEntries?: AttendanceVisit[];
  corrections?: CorrectionRecord[];
}
export interface AttendanceSnapshot extends Omit<
  AttendanceRecord,
  "patientId" | "doctorId" | "corrections"
> {
  corrections?: Array<
    Omit<CorrectionRecord, "actorId"> & { actor: { id: string; name: string } }
  >;
  patient: AttendancePatientReference;
  doctor: AttendanceDoctorReference;
}
export interface VisitsRepository {
  activeAttendance(
    clinicId: string,
    patientId: string,
    excluding: string,
  ): Promise<boolean>;
  correct(
    clinicId: string,
    current: AttendanceRecord,
    next: {
      status: AttendanceStatus;
      recordedEndAt: Date | null;
      visitStatus?: VisitRecord["status"];
    },
    actorId: string,
    kind: string,
    reason: string | null,
    at: Date,
  ): Promise<AttendanceRecord>;
  remove(clinicId: string, current: AttendanceRecord): Promise<void>;
  reviseVisit(
    clinicId: string,
    visitId: string,
    editVersion: number,
  ): Promise<void>;
  history(
    clinicId: string,
    patientId: string,
    page: number,
  ): Promise<AttendanceRecord[]>;
  activeVisit(clinicId: string, doctorId: string): Promise<VisitRecord | null>;
  start(
    clinicId: string,
    current: AttendanceRecord,
    actorId: string,
    at: Date,
  ): Promise<AttendanceRecord>;
  complete(
    clinicId: string,
    current: AttendanceRecord,
    at: Date,
  ): Promise<AttendanceRecord>;
  replace(
    clinicId: string,
    current: AttendanceRecord,
    next: {
      doctorId: string;
      status: AttendanceStatus;
      recordedEndAt: Date | null;
    },
  ): Promise<AttendanceRecord>;
  list(clinicId: string): Promise<AttendanceRecord[]>;
  find(clinicId: string, id: string): Promise<AttendanceRecord | null>;
  insert(input: {
    clinicId: string;
    patientId: string;
    doctorId: string;
    createdBy: string;
    arrivedAt: Date;
  }): Promise<AttendanceRecord>;
}
export interface VisitsScope {
  appointments: AppointmentsOperations;
  repository: VisitsRepository;
  patients: PatientsOperations;
  employees: EmployeesOperations;
  actor: ActorAccess | null;
}

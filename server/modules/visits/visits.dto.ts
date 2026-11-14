import type { ActorAccess } from "../../shared/actor";
import type {
  PatientsOperations,
  AttendancePatientReference,
} from "../patients";
import type {
  EmployeesOperations,
  AttendanceDoctorReference,
} from "../employees";
export type AttendanceStatus =
  "waiting" | "left_before_entry" | "with_doctor" | "completed";
export interface VisitRecord {
  id: string;
  attendanceId: string;
  patientId: string;
  doctorId: string;
  status: "in_progress" | "completed";
  startedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
}
export interface AttendanceRecord {
  id: string;
  patientId: string;
  doctorId: string;
  status: AttendanceStatus;
  arrivedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
  visit?: Omit<VisitRecord, "attendanceId" | "patientId" | "doctorId">;
}
export interface AttendanceSnapshot extends Omit<
  AttendanceRecord,
  "patientId" | "doctorId"
> {
  patient: AttendancePatientReference;
  doctor: AttendanceDoctorReference;
}
export interface VisitsRepository {
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
  repository: VisitsRepository;
  patients: PatientsOperations;
  employees: EmployeesOperations;
  actor: ActorAccess | null;
}

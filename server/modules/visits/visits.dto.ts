import type { ActorAccess } from "../../shared/actor";
import type {
  PatientsOperations,
  AttendancePatientReference,
} from "../patients";
import type {
  EmployeesOperations,
  AttendanceDoctorReference,
} from "../employees";
export type AttendanceStatus = "waiting" | "left_before_entry";
export interface AttendanceRecord {
  id: string;
  patientId: string;
  doctorId: string;
  status: AttendanceStatus;
  arrivedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
}
export interface AttendanceSnapshot extends Omit<
  AttendanceRecord,
  "patientId" | "doctorId"
> {
  patient: AttendancePatientReference;
  doctor: AttendanceDoctorReference;
}
export interface VisitsRepository {
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

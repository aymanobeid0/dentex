import type { ActorAccess } from "../../shared/actor";
import type { PatientsOperations } from "../patients";
import type { EmployeesOperations } from "../employees";
export interface AppointmentReceipt {
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: "booked";
  editVersion: number;
}
export interface NewAppointment {
  clinicId: string;
  patientId: string;
  doctorId: string;
  createdBy: string;
  startsAt: Date;
  endsAt: Date;
  administrativeNote: string | null;
}
export interface AppointmentsRepository {
  overlaps(input: NewAppointment): Promise<boolean>;
  insert(input: NewAppointment): Promise<AppointmentReceipt>;
}
export interface AppointmentsScope {
  repository: AppointmentsRepository;
  patients: PatientsOperations;
  employees: EmployeesOperations;
  actor: ActorAccess | null;
}

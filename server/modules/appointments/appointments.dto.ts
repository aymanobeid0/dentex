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
  visitReferences(
    clinicId: string,
    input: { patientId: string; day: string },
  ): Promise<AppointmentVisitReference[]>;
  visitLinks(
    clinicId: string,
    visitIds: readonly string[],
  ): Promise<AppointmentVisitLink[]>;
  visitPins(
    clinicId: string,
    appointmentId: string,
  ): Promise<Array<{ visitId: string; visitDay: string }>>;
  saveVisitLink(
    clinicId: string,
    input: SetVisitLinkInput,
    previous: AppointmentVisitLink,
  ): Promise<AppointmentVisitLink>;
  patientIds(clinicId: string, filter: AppointmentFilter): Promise<string[]>;
  list(
    clinicId: string,
    filter: AppointmentFilter,
    page: number | undefined,
    descending?: boolean,
  ): Promise<{ items: AppointmentRecord[]; total: number }>;
  find(clinicId: string, id: string): Promise<AppointmentRecord | null>;
  changes(clinicId: string, id: string): Promise<AppointmentChange[]>;
  overlaps(input: NewAppointment & { excludeId?: string }): Promise<boolean>;
  replace(
    clinicId: string,
    previous: AppointmentRecord,
    next: AppointmentRecord,
    actorId: string,
    action: string,
    cancellationReason?: string | null,
  ): Promise<AppointmentSnapshot>;
  insert(input: NewAppointment): Promise<AppointmentReceipt>;
}
export type AppointmentVisitReference = Pick<
  AppointmentRecord,
  "id" | "patientId" | "doctorId" | "startsAt" | "status" | "editVersion"
>;
export interface AppointmentVisitLink {
  visitId: string;
  appointmentId: string | null;
  editVersion: number;
  appointment?: AppointmentVisitReference | null;
}
type VisitLinkFacts = {
  visitId: string;
  patientId: string;
  visitDay: string;
  actorId: string;
  expectedLinkVersion: number;
};
export type SetVisitLinkInput = VisitLinkFacts &
  (
    | {
        kind: "assign";
        appointmentId: string;
        expectedAppointmentVersion: number;
      }
    | { kind: "detach" }
    | { kind: "invalidateEntry" }
  );
export interface AppointmentsOperations {
  visitReferences(
    clinicId: string,
    input: { patientId: string; day: string },
  ): Promise<AppointmentVisitReference[]>;
  visitLinks(
    clinicId: string,
    visitIds: readonly string[],
  ): Promise<AppointmentVisitLink[]>;
  setVisitLink(
    clinicId: string,
    input: SetVisitLinkInput,
  ): Promise<AppointmentVisitLink>;
}
export type AppointmentStatus = "booked" | "attended" | "absent" | "cancelled";
export interface AppointmentFilter {
  startsAt?: Date;
  before?: Date;
  doctorId?: string;
  status?: AppointmentStatus;
  patientIds?: string[];
}
export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  editVersion: number;
  administrativeNote: string | null;
  createdBy: string;
  createdAt: string;
}
export interface AppointmentChange {
  id: string;
  actorId: string;
  action: string;
  createdAt: string;
  before: unknown;
  after: unknown;
}
export type AppointmentSnapshot = Pick<
  AppointmentRecord,
  | "id"
  | "patientId"
  | "doctorId"
  | "startsAt"
  | "endsAt"
  | "status"
  | "editVersion"
  | "administrativeNote"
>;
export interface AppointmentsScope {
  repository: AppointmentsRepository;
  patients: PatientsOperations;
  employees: EmployeesOperations;
  actor: ActorAccess | null;
}

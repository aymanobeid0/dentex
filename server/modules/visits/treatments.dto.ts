import type {
  PlanCreate,
  PlanEdit,
  ItemCreate,
  ItemEdit,
} from "./treatments.schemas";
export interface TreatmentItem {
  performances?:TreatmentProcedure[];
  procedure?: TreatmentProcedure | null;
  id: string;
  planId: string;
  patientId: string;
  description: string;
  location: string;
  notes: string;
  status: "pending" | "cancelled";
  editVersion: number;
}
export interface TreatmentChange {
  actorName?: string;
  id: string;
  kind: string;
  actorId: string;
  reason: string | null;
  recordedAt: string;
  before: unknown;
  after: unknown;
}
export interface TreatmentPlan {
  progress?: { completed: number; pending: number; cancelled: number };
  id: string;
  patientId: string;
  title: string;
  notes: string;
  status: "active" | "cancelled";
  editVersion: number;
  createdAt: string;
  items: TreatmentItem[];
  history: TreatmentChange[];
}
export interface TreatmentsRepository {
  procedures(clinicId: string, visitId: string): Promise<TreatmentProcedure[]>;
  procedure(clinicId: string, id: string): Promise<TreatmentProcedure | null>;
  hasHistory(clinicId: string, visitId: string): Promise<boolean>;
  recordProcedure(
    clinicId: string,
    input: {
      id: string;
      patientId: string;
      visitId: string;
      itemId: string | null;
      description: string;
      location: string;
      notes: string;
      actorId: string;
    },
  ): Promise<void>;
  voidProcedure(
    clinicId: string,
    current: TreatmentProcedure,
    actorId: string,
    reason: string,
  ): Promise<void>;
  plans(clinicId: string, patientId: string): Promise<TreatmentPlan[]>;
  plan(clinicId: string, id: string): Promise<TreatmentPlan | null>;
  item(clinicId: string, id: string): Promise<TreatmentItem | null>;
  createPlan(
    clinicId: string,
    patientId: string,
    actorId: string,
    input: PlanCreate,
  ): Promise<string>;
  editPlan(
    clinicId: string,
    current: TreatmentPlan,
    actorId: string,
    input: PlanEdit,
  ): Promise<void>;
  createItem(
    clinicId: string,
    current: TreatmentPlan,
    actorId: string,
    input: ItemCreate,
  ): Promise<void>;
  editItem(
    clinicId: string,
    current: TreatmentItem,
    actorId: string,
    input: ItemEdit,
  ): Promise<void>;
}
export interface TreatmentProcedure {
  id: string;
  patientId: string;
  visitId: string;
  itemId: string | null;
  description: string;
  location: string;
  notes: string;
  actorId: string;
  actorName?: string;
  recordedAt: string;
  editVersion: number;
  voidedAt: string | null;
  voidActorId: string | null;
  voidActorName?: string;
  voidReason: string | null;
  visit: {
    id: string;
    attendanceId: string;
    doctorId: string;
    doctorName?: string;
    startedAt: string;
    status: string;
  };
}

import type {
  PlanCreate,
  PlanEdit,
  ItemCreate,
  ItemEdit,
} from "./treatments.schemas";
export interface TreatmentItem {
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

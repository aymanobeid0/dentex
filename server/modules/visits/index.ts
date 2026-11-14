export type { AttendanceSnapshot } from "./visits.dto";
/** Internal server composition only; no HTTP maintenance endpoint. */
export interface VisitsMaintenance {
  maintain(): Promise<void>;
}

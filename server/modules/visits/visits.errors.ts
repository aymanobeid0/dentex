import { ApplicationError } from "../../shared/errors";
export class VisitsError extends ApplicationError {
  constructor(
    code:
      | "genuine_visit_delete_forbidden"
      | "correction_not_allowed"
      | "attendance_active"
      | "patient_archived"
      | "doctor_ineligible"
      | "edit_conflict"
      | "attendance_not_waiting"
      | "doctor_busy"
      | "visit_required"
      | "visit_not_in_progress",
  ) {
    super(code);
  }
}

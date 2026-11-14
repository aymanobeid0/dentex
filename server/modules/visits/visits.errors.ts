import { ApplicationError } from "../../shared/errors";
export class VisitsError extends ApplicationError {
  constructor(
    code:
      | "attendance_active"
      | "patient_archived"
      | "doctor_ineligible"
      | "edit_conflict"
      | "attendance_not_waiting",
  ) {
    super(code);
  }
}

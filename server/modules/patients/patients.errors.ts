import { ApplicationError } from '../../shared/errors';
export class PatientsError extends ApplicationError {
  constructor(code: 'duplicate_phone' | 'not_found' | 'edit_conflict' | 'patient_archived') { super(code); }
}

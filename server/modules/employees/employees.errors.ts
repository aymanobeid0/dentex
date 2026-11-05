import { ApplicationError } from '../../shared/errors';
export class EmployeesError extends ApplicationError {
  constructor(code: 'edit_conflict' | 'not_found' | 'invalid_roles' | 'last_admin' | 'duplicate_username') { super(code); }
}

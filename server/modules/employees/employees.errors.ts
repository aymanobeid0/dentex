import { ApplicationError } from '../../shared/errors';
export class EmployeesError extends ApplicationError {
  constructor(code: 'not_found' | 'invalid_roles' | 'last_admin' | 'duplicate_username') { super(code); }
}

import { ApplicationError } from '../../shared/errors';
export class RolesError extends ApplicationError {
  constructor(code: 'invalid_roles' | 'invalid_permissions' | 'edit_conflict' | 'not_found' | 'admin_locked') { super(code); }
}

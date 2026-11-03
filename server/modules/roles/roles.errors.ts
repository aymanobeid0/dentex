import { ApplicationError } from '../../shared/errors';
export class RolesError extends ApplicationError {
  constructor(code: 'invalid_roles' | 'invalid_permissions' | 'not_found' | 'admin_locked') { super(code); }
}

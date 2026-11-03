import { ApplicationError } from '../../shared/errors';
export class ClinicsError extends ApplicationError {
  constructor(code: 'not_found' | 'duplicate_code') { super(code); }
}

import { ApplicationError } from '../../shared/errors';
export class IncorrectPasswordError extends ApplicationError {
  constructor() { super('incorrect_password'); }
}

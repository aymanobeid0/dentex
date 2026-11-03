import { AuthenticationError } from '../../shared/errors';

export class InvalidCredentialsError extends AuthenticationError {
  constructor() { super('invalid_credentials'); }
}

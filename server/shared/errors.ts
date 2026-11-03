/** Domain failures carry stable codes, never HTTP status or framework objects. */
export class ApplicationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = new.target.name;
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(code: 'unauthorized' | 'invalid_credentials' = 'unauthorized') { super(code); }
}

export class AuthorizationError extends ApplicationError {
  constructor(code: 'forbidden' | 'untrusted_origin' = 'forbidden') { super(code); }
}

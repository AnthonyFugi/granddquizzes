// Errors safe to show to players and hosts. Anything else is logged and hidden.
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

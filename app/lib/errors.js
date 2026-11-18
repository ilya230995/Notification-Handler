export class ValidationError extends Error {
  constructor(field, reason) {
    super(`${field}: ${reason}`);
    this.name = "ValidationError";
    this.field = field;
    this.reason = reason;
  }
}

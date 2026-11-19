/** A bad input value. The pipeline reports it as `invalid: <field>: <reason>`. */
export class ValidationError extends Error {
  /**
   * @param {string} field
   * @param {string} reason
   */
  constructor(field, reason) {
    super(`${field}: ${reason}`);
    this.name = "ValidationError";
    this.field = field;
    this.reason = reason;
  }
}

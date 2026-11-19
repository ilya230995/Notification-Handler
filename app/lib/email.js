import isEmail from "validator/lib/isEmail.js";
import { ValidationError } from "./errors.js";

/**
 * Validates an email address and lowercases its domain.
 * @param {unknown} value
 * @param {string} [field]
 * @returns {string}
 * @throws {ValidationError}
 */
export function assertEmail(value, field = "email") {
  if (typeof value !== "string") {
    throw new ValidationError(field, "must be a string");
  }
  const email = value.trim();
  if (!isEmail(email)) {
    throw new ValidationError(field, "not a valid email address");
  }
  const at = email.lastIndexOf("@");
  return email.slice(0, at + 1) + email.slice(at + 1).toLowerCase();
}

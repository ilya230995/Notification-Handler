import { assertEmail } from "../lib/email.js";
import { toIsoDate } from "../lib/dates.js";
import { normalizeRoles } from "../lib/roles.js";
import { ValidationError } from "../lib/errors.js";

function requireName(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("name", "must be a non-empty string");
  }
  return value.trim();
}

export default {
  type: "user_registered",
  notificationTypeId: 1,
  normalize(raw) {
    return {
      name: requireName(raw.name),
      email: assertEmail(raw.email),
      roles: normalizeRoles(raw.roles),
      joined: toIsoDate(raw.joined, "joined"),
    };
  },
};

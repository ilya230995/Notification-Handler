import { ValidationError } from "./errors.js";

export function normalizeRoles(value) {
  if (value === null || value === undefined) return [];

  let items;
  if (typeof value === "string") {
    items = value.split(",");
  } else if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === "string")) {
      throw new ValidationError("roles", "entries must be strings");
    }
    items = value;
  } else {
    throw new ValidationError("roles", "must be a string or an array of strings");
  }

  const roles = items.map((r) => r.trim()).filter((r) => r !== "");
  return [...new Set(roles)];
}

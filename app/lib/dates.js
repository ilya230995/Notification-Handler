import { DateTime } from "luxon";
import { ValidationError } from "./errors.js";

// Abbreviations name a specific offset (PST is always UTC-8), not a region.
// Mapping them to an IANA zone would silently apply daylight saving time.
const FIXED_OFFSETS = {
  PST: "-08:00",
  PDT: "-07:00",
  MST: "-07:00",
  MDT: "-06:00",
  CST: "-06:00",
  CDT: "-05:00",
  EST: "-05:00",
  EDT: "-04:00",
  UTC: "+00:00",
  GMT: "+00:00",
};

const OPTS = { zone: "utc", setZone: true };
const NATURAL_OPTS = { ...OPTS, locale: "en-US" };

const NATURAL_FORMATS = [
  "MMMM d, yyyy HH:mm ZZ",
  "MMMM d, yyyy HH:mm",
  "MMMM d, yyyy",
  "MMM d, yyyy HH:mm ZZ",
  "MMM d, yyyy HH:mm",
  "MMM d, yyyy",
];

function parseNatural(text) {
  let s = text.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  const tz = s.match(/\s([A-Za-z]{2,5})$/);
  if (tz) {
    const offset = FIXED_OFFSETS[tz[1].toUpperCase()];
    if (!offset) return null;
    s = s.slice(0, tz.index) + " " + offset;
  }
  for (const format of NATURAL_FORMATS) {
    const dt = DateTime.fromFormat(s, format, NATURAL_OPTS);
    if (dt.isValid) return dt;
  }
  return null;
}

/**
 * Parses a date in one of the supported formats and returns it as a UTC ISO string.
 * @param {unknown} value
 * @param {string} field name used in the error
 * @returns {string}
 * @throws {ValidationError}
 */
export function toIsoDate(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(field, "must be a non-empty date string");
  }
  if (value.length > 64) throw new ValidationError(field, "too long");
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    throw new ValidationError(field, "numeric timestamps are not supported");
  }

  const candidates = [
    // fromISO also accepts a bare time such as "10:00" and fills in today's date.
    () => (/^[+-]?\d{4}/.test(v) ? DateTime.fromISO(v, OPTS) : null),
    () => DateTime.fromFormat(v, "yyyy/MM/dd HH:mmZZ", OPTS),
    () => DateTime.fromFormat(v, "yyyy/MM/dd", OPTS),
    () => parseNatural(v),
  ];
  for (const attempt of candidates) {
    const dt = attempt();
    if (dt && dt.isValid) return dt.toUTC().toISO();
  }
  throw new ValidationError(field, "unrecognized date format");
}

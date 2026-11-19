import { registry as defaultRegistry } from "./events/index.js";
import { ValidationError } from "./lib/errors.js";

/**
 * @typedef {{
 *   NotificationTypeID: number,
 *   NotificationData: object,
 *   Status: 0, CreatedByType: 0, CreatedByID: 0, Seen: 0, IsBookmarked: 0,
 * }} NotificationRow
 *
 * @typedef {{
 *   index: number,
 *   type: string | null,
 *   eventId: string | null,
 *   status: "stored" | "rejected" | "skipped" | "failed",
 *   reason?: string,
 *   notificationId?: number,
 * }} EventResult
 */

/**
 * Builds a Notification row from a normalized payload.
 * @param {import("./events/index.js").EventDescriptor} descriptor
 * @param {object} normalized
 * @param {string} [eventId] added to NotificationData when present
 * @returns {NotificationRow}
 */
export function toNotificationRow(descriptor, normalized, eventId) {
  return {
    NotificationTypeID: descriptor.notificationTypeId,
    NotificationData: eventId === undefined ? normalized : { ...normalized, event_id: eventId },
    Status: 0,
    CreatedByType: 0,
    CreatedByID: 0,
    Seen: 0,
    IsBookmarked: 0,
  };
}

const errorReason = (err) => `error: ${err?.message ?? String(err)}`;

/**
 * Validates, dedupes and stores each event in order. One bad event never stops the batch.
 * @param {unknown[]} rawEvents
 * @param {{
 *   insertToMySQL: (row: NotificationRow) => Promise<{ notificationId: number }>,
 *   logger: ReturnType<typeof import("./lib/logger.js").createLogger>,
 *   registry?: ReadonlyMap<string, import("./events/index.js").EventDescriptor>,
 * }} deps
 * @returns {Promise<{ results: EventResult[], summary: Record<string, number> }>}
 */
export async function processEvents(
  rawEvents,
  { insertToMySQL, logger, registry = defaultRegistry },
) {
  if (!Array.isArray(rawEvents)) throw new TypeError("expected an array of events");

  const results = [];
  const seen = new Set();

  for (const [index, raw] of rawEvents.entries()) {
    const isObject = raw !== null && typeof raw === "object" && !Array.isArray(raw);
    const type = isObject && typeof raw.type === "string" && raw.type !== "" ? raw.type : null;
    const rawId = isObject ? raw.event_id : undefined;
    const eventId = typeof rawId === "string" ? rawId : null;
    const validId = rawId === undefined || rawId === null || (typeof rawId === "string" && rawId !== "");
    const result = { index, type, eventId };

    const finish = (status, reason, notificationId) => {
      result.status = status;
      if (reason !== undefined) result.reason = reason;
      if (notificationId !== undefined) result.notificationId = notificationId;
      if (status === "rejected" || status === "skipped") {
        logger.warn(status, { index, type, eventId, reason });
      } else if (status === "failed") {
        logger.error(status, { index, type, eventId, reason });
      }
      results.push(result);
    };

    if (!isObject || !type) {
      finish("rejected", "malformed");
      continue;
    }
    const descriptor = registry.get(type);
    if (!descriptor) {
      finish("rejected", "unknown_type");
      continue;
    }
    if (!validId) {
      finish("rejected", "invalid: event_id: must be a non-empty string");
      continue;
    }
    if (eventId !== null && seen.has(eventId)) {
      finish("skipped", "duplicate");
      continue;
    }

    let row;
    try {
      row = toNotificationRow(descriptor, descriptor.normalize(raw), eventId ?? undefined);
    } catch (err) {
      if (err instanceof ValidationError) finish("rejected", `invalid: ${err.message}`);
      else finish("failed", errorReason(err));
      continue;
    }

    try {
      const { notificationId } = await insertToMySQL(row);
      // Only a stored event counts as seen, so a rejected or failed first copy
      // doesn't block a valid retry with the same event_id.
      if (eventId !== null) seen.add(eventId);
      finish("stored", undefined, notificationId);
    } catch (err) {
      finish("failed", errorReason(err));
    }
  }

  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    results,
    summary: {
      total: rawEvents.length,
      stored: count("stored"),
      rejected: count("rejected"),
      skipped: count("skipped"),
      failed: count("failed"),
    },
  };
}

import { createLogger } from "../lib/logger.js";

/**
 * Creates an insertToMySQL stub that logs the row and returns incrementing ids.
 * @param {{ logger: { info: (msg: string, context?: object) => void } }} deps
 * @returns {{ insertToMySQL: (row: import("../pipeline.js").NotificationRow) => Promise<{ notificationId: number }> }}
 */
export function createMySqlStub({ logger }) {
  let nextId = 1;
  // Stands in for a parameterized INSERT INTO Notification (...) VALUES (?, ...).
  async function insertToMySQL(row) {
    const notificationId = nextId++;
    logger.info("insertToMySQL", { notificationId, row });
    return { notificationId };
  }
  return { insertToMySQL };
}

let defaultStub;

/**
 * Standalone stub backed by a module-level instance, logging at LOG_LEVEL.
 * @param {import("../pipeline.js").NotificationRow} row
 * @returns {Promise<{ notificationId: number }>}
 */
export function insertToMySQL(row) {
  defaultStub ??= createMySqlStub({
    logger: createLogger({ level: process.env.LOG_LEVEL || "INFO" }),
  });
  return defaultStub.insertToMySQL(row);
}

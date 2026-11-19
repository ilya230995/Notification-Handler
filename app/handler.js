import { processEvents } from "./pipeline.js";
import { createLogger } from "./lib/logger.js";
import { createMySqlStub } from "./db/mysql.js";

/**
 * Builds a handler around the given logger and insert function.
 * @param {{ logger: object, insertToMySQL: Function }} deps
 * @returns {(event: unknown[] | { events: unknown[] }, context?: { awsRequestId?: string }) =>
 *   Promise<{ summary: object, results: import("./pipeline.js").EventResult[] }>}
 */
export function createHandler({ logger, insertToMySQL }) {
  return async (event, context) => {
    const rawEvents = Array.isArray(event) ? event : event?.events;
    const { results, summary } = await processEvents(rawEvents, { insertToMySQL, logger });
    logger.info("batch processed", { ...summary, requestId: context?.awsRequestId });
    return { summary, results };
  };
}

/**
 * Lambda entry point. Accepts an array of events or `{ events: [...] }`.
 * @param {unknown[] | { events: unknown[] }} event
 * @param {{ awsRequestId?: string }} [context]
 */
export async function handler(event, context) {
  // An invalid LOG_LEVEL throws here, failing the invocation up front.
  const logger = createLogger({ level: process.env.LOG_LEVEL || "INFO" });
  // The stub's notification IDs restart on every invocation.
  const { insertToMySQL } = createMySqlStub({ logger });
  return createHandler({ logger, insertToMySQL })(event, context);
}

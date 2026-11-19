const HEADERS = ["#", "type", "event_id", "status", "reason"];

// Values come straight from the input, so a newline or an escape code would break the table.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const cell = (value) =>
  value === null || value === undefined || value === "" ? "-" : String(value).replace(CONTROL_CHARS, "?");

/**
 * Formats the handler result as a summary line followed by a table of events.
 * @param {{ summary: object, results: import("./pipeline.js").EventResult[] }} result
 * @returns {string}
 */
export function formatReport({ summary, results }) {
  const { total, stored, rejected, skipped, failed } = summary;
  const head = `Processed ${total} events: ${stored} stored, ${rejected} rejected, ${skipped} skipped, ${failed} failed`;

  const rows = results.map((r) => [r.index, r.type, r.eventId, r.status, r.reason].map(cell));
  const widths = HEADERS.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cols) =>
    cols
      .map((c, i) => c.padEnd(widths[i]))
      .join("  ")
      .trimEnd();

  return [
    head,
    "",
    line(HEADERS),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map(line),
  ].join("\n");
}

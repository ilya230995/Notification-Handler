import test from "node:test";
import assert from "node:assert/strict";
import { formatReport } from "../app/report.js";

const result = {
  summary: { total: 3, stored: 1, rejected: 1, skipped: 1, failed: 0 },
  results: [
    { index: 0, type: "user_registered", eventId: null, status: "stored", notificationId: 1 },
    { index: 1, type: "unknown_type", eventId: null, status: "rejected", reason: "unknown_type" },
    { index: 2, type: null, eventId: "dedupe-1", status: "skipped", reason: "duplicate" },
  ],
};

test("formatReport starts with the summary line", () => {
  const [first, second] = formatReport(result).split("\n");
  assert.equal(first, "Processed 3 events: 1 stored, 1 rejected, 1 skipped, 0 failed");
  assert.equal(second, "");
});

test("formatReport renders an aligned table with dashes for empty values", () => {
  const lines = formatReport(result).split("\n");
  assert.match(lines[2], /^#\s+type\s+event_id\s+status\s+reason/);
  assert.match(lines[3], /^-+\s+-+\s+-+\s+-+\s+-+/);
  assert.match(lines[4], /^0\s+user_registered\s+-\s+stored\s+-$/);
  assert.match(lines[6], /^2\s+-\s+dedupe-1\s+skipped\s+duplicate$/);
  const col = lines[2].indexOf("type");
  assert.ok(lines.slice(4).every((l) => l[col - 1] === " "));
});

test("formatReport handles an empty batch", () => {
  const out = formatReport({
    summary: { total: 0, stored: 0, rejected: 0, skipped: 0, failed: 0 },
    results: [],
  });
  assert.ok(out.startsWith("Processed 0 events: 0 stored, 0 rejected, 0 skipped, 0 failed"));
});

test("formatReport replaces control characters in cell values", () => {
  const out = formatReport({
    summary: { total: 1, stored: 0, rejected: 1, skipped: 0, failed: 0 },
    results: [{ index: 0, type: "bad\ntype\u001b[31m", eventId: null, status: "rejected", reason: "unknown_type" }],
  });
  const lines = out.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[4], /^0\s+bad\?type\?\[31m\s+-\s+rejected\s+unknown_type$/);
  assert.ok(!out.includes("\u001b"));
});

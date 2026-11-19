import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../../app/lib/logger.js";

function capture(level) {
  const lines = [];
  const logger = createLogger({ level, write: (line) => lines.push(line) });
  return { logger, lines };
}

test("logger: filters below level", () => {
  const { logger, lines } = capture("WARN");
  logger.info("skipped");
  assert.equal(lines.length, 0);
  logger.warn("kept");
  assert.equal(lines.length, 1);
});

test("logger: JSON line with context", () => {
  const { logger, lines } = capture("INFO");
  logger.info("hi", { a: 1 });
  assert.deepEqual(JSON.parse(lines[0]), { level: "INFO", msg: "hi", a: 1 });
  assert.ok(lines[0].startsWith('{"level":"INFO","msg":"hi"'), lines[0]);
});

test("logger: case-insensitive level", () => {
  const { logger, lines } = capture("debug");
  logger.debug("low");
  assert.equal(JSON.parse(lines[0]).level, "DEBUG");
});

test("logger: unknown level throws", () => {
  assert.throws(() => createLogger({ level: "LOUD" }), /DEBUG, INFO, WARN, ERROR/);
});

test("logger: context cannot overwrite level or msg", () => {
  const { logger, lines } = capture("INFO");
  logger.info("hi", { level: "X", msg: "Y", a: 1 });
  assert.deepEqual(JSON.parse(lines[0]), { level: "INFO", msg: "hi", a: 1 });
  assert.ok(lines[0].startsWith('{"level":"INFO","msg":"hi"'));
});

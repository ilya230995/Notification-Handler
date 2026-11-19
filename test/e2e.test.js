import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { processEvents } from "../app/pipeline.js";
import { createMySqlStub } from "../app/db/mysql.js";
import { formatReport } from "../app/report.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const run = promisify(execFile);
const silent = { debug() {}, info() {}, warn() {}, error() {} };

async function runCli(...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, ["app/run.js", ...args], { cwd: root });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

async function runSample() {
  const events = JSON.parse(await readFile(new URL("../sample/events.json", import.meta.url)));
  const rows = [];
  const { insertToMySQL } = createMySqlStub({ logger: silent });
  const outcome = await processEvents(events, {
    logger: silent,
    insertToMySQL: (row) => {
      rows.push(row.NotificationData);
      return insertToMySQL(row);
    },
  });
  const storedIndexes = outcome.results.filter((r) => r.status === "stored").map((r) => r.index);
  const byIndex = Object.fromEntries(storedIndexes.map((index, i) => [index, rows[i]]));
  return { ...outcome, byIndex };
}

test("sample events produce the expected statuses and reasons", async () => {
  const { results, summary } = await runSample();
  assert.deepEqual(
    results.map((r) => r.status),
    ["stored", "rejected", "stored", "stored", "rejected", "stored", "skipped"],
  );
  assert.match(results[1].reason, /^invalid: email/);
  assert.equal(results[4].reason, "unknown_type");
  assert.equal(results[6].reason, "duplicate");
  assert.deepEqual(summary, { total: 7, stored: 4, rejected: 2, skipped: 1, failed: 0 });
});

test("stored payloads are normalized", async () => {
  const { byIndex } = await runSample();
  assert.deepEqual(byIndex[0].roles, ["admin", "editor", "manager"]);
  assert.equal(byIndex[0].joined, "2021-04-01T00:00:00.000Z");
  assert.equal(byIndex[2].requested, "2021-06-01T08:23:00.000Z");
  assert.equal(byIndex[3].deleted, "2021-07-15T00:00:00.000Z");
  assert.deepEqual(byIndex[5].roles, []);
});

test("report for the sample run", async () => {
  const out = formatReport(await runSample());
  assert.equal(out.split("\n")[0], "Processed 7 events: 4 stored, 2 rejected, 1 skipped, 0 failed");
  assert.ok(out.includes("unknown_type"));
});

const assertCleanError = (stderr, pattern) => {
  assert.match(stderr, pattern);
  assert.match(stderr, /^Error: /);
  assert.equal(stderr.trim().split("\n").filter((l) => l.startsWith("Error:")).length, 1);
  assert.ok(!stderr.includes("    at "));
};

test("CLI runs the sample and prints the report", async () => {
  const { code, stdout } = await runCli("--input", "sample/events.json", "--log-level", "ERROR");
  assert.equal(code, 0);
  assert.ok(stdout.startsWith("Processed 7 events"));
});

test("CLI without --input exits 1 and shows usage", async () => {
  const { code, stderr } = await runCli();
  assert.equal(code, 1);
  assertCleanError(stderr, /--input is required/);
  assert.match(stderr, /Usage: node app\/run\.js/);
});

test("CLI rejects a payload that is not an array", async () => {
  const { code, stderr } = await runCli("--input", fixture("not-array.json"));
  assert.equal(code, 1);
  assertCleanError(stderr, /expected an array of events/);
});

test("CLI accepts an empty array", async () => {
  const { code, stdout } = await runCli("--input", fixture("empty.json"));
  assert.equal(code, 0);
  assert.ok(stdout.startsWith("Processed 0 events: 0 stored, 0 rejected, 0 skipped, 0 failed"));
});

test("CLI rejects invalid JSON", async () => {
  const { code, stderr } = await runCli("--input", fixture("invalid.json"));
  assert.equal(code, 1);
  assertCleanError(stderr, /is not valid JSON/);
});

test("CLI reports a missing file", async () => {
  const { code, stderr } = await runCli("--input", fixture("does-not-exist.json"));
  assert.equal(code, 1);
  assertCleanError(stderr, /cannot read/);
});

test("CLI rejects an unknown log level", async () => {
  const { code, stderr } = await runCli("--input", "sample/events.json", "--log-level", "LOUD");
  assert.equal(code, 1);
  assertCleanError(stderr, /DEBUG/);
});

test("CLI reports a bad log level before reading the input", async () => {
  const { code, stderr } = await runCli("--input", fixture("does-not-exist.json"), "--log-level", "LOUD");
  assert.equal(code, 1);
  assertCleanError(stderr, /Unknown log level "LOUD"/);
});

test("CLI rejects an unknown option", async () => {
  const { code, stderr } = await runCli("--bogus");
  assert.equal(code, 1);
  assertCleanError(stderr, /bogus/);
});

test("CLI --help prints usage and exits 0", async () => {
  const { code, stdout } = await runCli("--help");
  assert.equal(code, 0);
  assert.ok(stdout.includes("--input"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { processEvents } from "../app/pipeline.js";
import { createMySqlStub } from "../app/db/mysql.js";
import { buildRegistry } from "../app/events/index.js";
import { ValidationError } from "../app/lib/errors.js";

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const alice = {
  type: "user_registered",
  name: "Alice",
  email: "alice@example.com",
  roles: "admin, editor ,  manager",
  joined: "2021-04-01",
};
const bob = {
  type: "user_registered",
  name: "Bob Smith",
  email: "bob.smith(at)example.com",
  roles: ["viewer", " "],
  joined: "April 5th, 2021 13:45 PST",
};
const carol = {
  type: "password_reset",
  email: "carol@example.com",
  requested: "2021/06/01 10:23+02:00",
};

function fakeDb({ failOnCall } = {}) {
  const rows = [];
  let calls = 0;
  return {
    rows,
    async insertToMySQL(row) {
      calls += 1;
      if (calls === failOnCall) throw new Error("connection lost");
      rows.push(row);
      return { notificationId: rows.length };
    },
  };
}

const run = (events, db, extra = {}) =>
  processEvents(events, { insertToMySQL: db.insertToMySQL, logger: silent, ...extra });

test("stores valid event as Notification row", async () => {
  const db = fakeDb();
  const { results, summary } = await run([alice], db);
  assert.equal(results[0].status, "stored");
  assert.equal(results[0].notificationId, 1);
  assert.deepEqual(db.rows[0], {
    NotificationTypeID: 1,
    NotificationData: {
      name: "Alice",
      email: "alice@example.com",
      roles: ["admin", "editor", "manager"],
      joined: "2021-04-01T00:00:00.000Z",
    },
    Status: 0,
    CreatedByType: 0,
    CreatedByID: 0,
    Seen: 0,
    IsBookmarked: 0,
  });
  assert.deepEqual(summary, { total: 1, stored: 1, rejected: 0, skipped: 0, failed: 0 });
});

test("malformed items", async () => {
  const { results } = await run([null, "x", [], {}, { type: "" }, { type: 5 }], fakeDb());
  for (const r of results) assert.equal(r.status, "rejected");
  assert.deepEqual(results.map((r) => r.reason), Array(6).fill("malformed"));
  assert.equal(results[4].type, null);
  assert.equal(results[5].type, null);
});

test("unknown type", async () => {
  const { results } = await run([{ type: "nope" }], fakeDb());
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, "unknown_type");
});

test("invalid event continues batch", async () => {
  const { results, summary } = await run([bob, carol], fakeDb());
  assert.equal(results[0].status, "rejected");
  assert.ok(results[0].reason.startsWith("invalid: email"));
  assert.equal(results[1].status, "stored");
  assert.equal(summary.rejected, 1);
});

test("non-string event_id is rejected", async () => {
  const { results } = await run([{ ...alice, event_id: 42 }], fakeDb());
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, "invalid: event_id: must be a non-empty string");
  assert.equal(results[0].eventId, null);
});

test("duplicate event_id: first stored wins", async () => {
  const db = fakeDb();
  const { results } = await run(
    [{ ...alice, event_id: "dedupe-1" }, { ...carol, event_id: "dedupe-1" }],
    db,
  );
  assert.equal(results[0].status, "stored");
  assert.equal(results[1].status, "skipped");
  assert.equal(results[1].reason, "duplicate");
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].NotificationData.event_id, "dedupe-1");
});

test("invalid first copy does not block later copy", async () => {
  const { results } = await run(
    [{ ...bob, event_id: "dedupe-2" }, { ...alice, event_id: "dedupe-2" }],
    fakeDb(),
  );
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "stored");
});

test("insert failure does not block later copy", async () => {
  const db = fakeDb({ failOnCall: 1 });
  const { results, summary } = await run(
    [{ ...alice, event_id: "dedupe-3" }, { ...alice, event_id: "dedupe-3" }],
    db,
  );
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].reason, "error: connection lost");
  assert.equal(results[1].status, "stored");
  assert.equal(summary.failed, 1);
});

test("buggy descriptor does not stop batch", async () => {
  const registry = buildRegistry([
    {
      type: "broken",
      notificationTypeId: 9,
      normalize() {
        throw new Error("boom");
      },
    },
    {
      type: "fine",
      notificationTypeId: 8,
      normalize: () => ({ ok: true }),
    },
  ]);
  const { results } = await run([{ type: "broken" }, { type: "fine" }], fakeDb(), { registry });
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].reason, "error: boom");
  assert.equal(results[1].status, "stored");
});

test("thrown null does not stop batch", async () => {
  const registry = buildRegistry([
    {
      type: "nully",
      notificationTypeId: 9,
      normalize() {
        throw null;
      },
    },
    { type: "fine", notificationTypeId: 8, normalize: () => ({ ok: true }) },
  ]);
  const { results } = await run([{ type: "nully" }, { type: "fine" }], fakeDb(), { registry });
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].reason, "error: null");
  assert.equal(results[1].status, "stored");
});

test("ValidationError from insert is failed, not rejected", async () => {
  const insertToMySQL = async () => {
    throw new ValidationError("x", "y");
  };
  const { results } = await processEvents([alice], { insertToMySQL, logger: silent });
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].reason, "error: x: y");
});

test("empty event_id is rejected", async () => {
  const { results } = await run([{ ...alice, event_id: "" }], fakeDb());
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, "invalid: event_id: must be a non-empty string");
});

test("rejections log WARN and failures log ERROR with context", async () => {
  const lines = [];
  const rec = (level) => (msg, ctx) => lines.push({ level, msg, ctx });
  const logger = { debug: rec("DEBUG"), info: rec("INFO"), warn: rec("WARN"), error: rec("ERROR") };
  const db = fakeDb({ failOnCall: 1 });
  await processEvents([{ type: "nope", event_id: "e1" }, alice], {
    insertToMySQL: db.insertToMySQL,
    logger,
  });
  assert.equal(lines[0].level, "WARN");
  assert.deepEqual(lines[0].ctx, { index: 0, type: "nope", eventId: "e1", reason: "unknown_type" });
  assert.equal(lines[1].level, "ERROR");
  assert.deepEqual(lines[1].ctx, {
    index: 1,
    type: "user_registered",
    eventId: null,
    reason: "error: connection lost",
  });
});

test("empty batch", async () => {
  const { results, summary } = await run([], fakeDb());
  assert.deepEqual(results, []);
  assert.deepEqual(summary, { total: 0, stored: 0, rejected: 0, skipped: 0, failed: 0 });
});

test("results preserve input order and index", async () => {
  const { results } = await run([alice, null, carol], fakeDb());
  assert.deepEqual(
    results.map((r) => [r.index, r.type, r.status]),
    [
      [0, "user_registered", "stored"],
      [1, null, "rejected"],
      [2, "password_reset", "stored"],
    ],
  );
});

test("non-array input throws TypeError", async () => {
  await assert.rejects(run({}, fakeDb()), {
    name: "TypeError",
    message: "expected an array of events",
  });
});

test("createMySqlStub assigns incrementing ids", async () => {
  const stub = createMySqlStub({ logger: silent });
  assert.deepEqual(await stub.insertToMySQL({}), { notificationId: 1 });
  assert.deepEqual(await stub.insertToMySQL({}), { notificationId: 2 });
});

test("createMySqlStub logs the insert at INFO", async () => {
  const lines = [];
  const stub = createMySqlStub({ logger: { info: (msg, ctx) => lines.push({ msg, ctx }) } });
  const row = { a: 1 };
  await stub.insertToMySQL(row);
  assert.deepEqual(lines, [{ msg: "insertToMySQL", ctx: { notificationId: 1, row } }]);
});

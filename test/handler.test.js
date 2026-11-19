import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHandler, handler } from "../app/handler.js";

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const alice = {
  type: "user_registered",
  name: "Alice",
  email: "alice@example.com",
  roles: "admin",
  joined: "2021-04-01",
};
const carol = {
  type: "password_reset",
  email: "carol@example.com",
  requested: "2021/06/01 10:23+02:00",
};

function fakeInsert() {
  let id = 0;
  return async () => ({ notificationId: ++id });
}

const build = (logger = silent) => createHandler({ logger, insertToMySQL: fakeInsert() });

test("handler accepts bare array", async () => {
  const { summary, results } = await build()([alice]);
  assert.equal(summary.stored, 1);
  assert.equal(results[0].status, "stored");
});

test("handler accepts { events: [...] }", async () => {
  const { summary, results } = await build()({ events: [carol] });
  assert.equal(summary.stored, 1);
  assert.equal(results[0].type, "password_reset");
});

test("handler rejects non-array payload", async () => {
  for (const payload of [{}, "x", { events: "x" }]) {
    await assert.rejects(build()(payload), {
      name: "TypeError",
      message: /expected an array of events/,
    });
  }
});

test("handler logs summary with requestId", async () => {
  const lines = [];
  const logger = {
    ...silent,
    info: (msg, context) => lines.push({ level: "INFO", msg, ...context }),
  };
  await build(logger)([alice], { awsRequestId: "req-1" });
  const line = lines.find((l) => l.msg === "batch processed");
  assert.ok(line);
  assert.equal(line.level, "INFO");
  assert.equal(line.requestId, "req-1");
  assert.equal(line.stored, 1);
});

test("exported handler rejects invalid LOG_LEVEL", async () => {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "LOUD";
  try {
    await assert.rejects(handler([]), /Unknown log level/);
  } finally {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  }
});

test("exported handler runs with default level", async () => {
  const previous = process.env.LOG_LEVEL;
  delete process.env.LOG_LEVEL;
  const write = mock.method(process.stderr, "write", () => true);
  try {
    const { summary, results } = await handler([]);
    assert.deepEqual(results, []);
    assert.ok(Object.values(summary).every((n) => n === 0));
    const lines = write.mock.calls.map((c) => JSON.parse(c.arguments[0]));
    const info = lines.filter((l) => l.level === "INFO" && l.msg === "batch processed");
    assert.equal(info.length, 1);
  } finally {
    write.mock.restore();
    if (previous !== undefined) process.env.LOG_LEVEL = previous;
  }
});

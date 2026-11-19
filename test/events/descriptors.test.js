import test from "node:test";
import assert from "node:assert/strict";
import userRegistered from "../../app/events/userRegistered.js";
import passwordReset from "../../app/events/passwordReset.js";
import userDeleted from "../../app/events/userDeleted.js";
import { registry, buildRegistry } from "../../app/events/index.js";
import { ValidationError } from "../../app/lib/errors.js";

test("user_registered normalizes", () => {
  const out = userRegistered.normalize({
    type: "user_registered",
    name: "Alice",
    email: "alice@example.com",
    roles: "admin, editor ,  manager",
    joined: "2021-04-01",
  });
  assert.deepEqual(out, {
    name: "Alice",
    email: "alice@example.com",
    roles: ["admin", "editor", "manager"],
    joined: "2021-04-01T00:00:00.000Z",
  });
});

test("user_registered requires name", () => {
  const base = { email: "alice@example.com", roles: "admin", joined: "2021-04-01" };
  for (const raw of [base, { ...base, name: "  " }]) {
    assert.throws(
      () => userRegistered.normalize(raw),
      (err) => err instanceof ValidationError && err.field === "name",
    );
  }
});

test("password_reset normalizes", () => {
  const out = passwordReset.normalize({
    type: "password_reset",
    email: "carol@example.com",
    requested: "2021/06/01 10:23+02:00",
  });
  assert.deepEqual(out, {
    email: "carol@example.com",
    requested: "2021-06-01T08:23:00.000Z",
  });
});

test("user_deleted normalizes", () => {
  const out = userDeleted.normalize({
    type: "user_deleted",
    email: "david@example.com",
    deleted: "2021-07-15T00:00:00",
  });
  assert.deepEqual(out, {
    email: "david@example.com",
    deleted: "2021-07-15T00:00:00.000Z",
  });
});

test("registry has the three types with ids 1, 2, 3", () => {
  assert.deepEqual(
    [...registry].map(([type, d]) => [type, d.notificationTypeId]),
    [["user_registered", 1], ["password_reset", 2], ["user_deleted", 3]],
  );
});

test("buildRegistry rejects duplicate types", () => {
  const a = { type: "x", notificationTypeId: 9, normalize: () => ({}) };
  assert.throws(() => buildRegistry([a, a]), /Duplicate event type: x/);
});

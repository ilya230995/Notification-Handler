import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRoles } from "../../app/lib/roles.js";
import { ValidationError } from "../../app/lib/errors.js";

test("roles: comma string", () => {
  assert.deepEqual(normalizeRoles("admin, editor ,  manager"), ["admin", "editor", "manager"]);
});

test("roles: array with blanks", () => {
  assert.deepEqual(normalizeRoles(["viewer", " "]), ["viewer"]);
});

test("roles: null/undefined", () => {
  assert.deepEqual(normalizeRoles(null), []);
  assert.deepEqual(normalizeRoles(undefined), []);
});

test("roles: only separators", () => {
  assert.deepEqual(normalizeRoles(", ,"), []);
  assert.deepEqual(normalizeRoles([" "]), []);
});

test("roles: dedupes keeping order and case", () => {
  assert.deepEqual(normalizeRoles("Admin, editor, Admin"), ["Admin", "editor"]);
});

test("roles: rejects non-string entries", () => {
  for (const value of [["admin", 5], ["admin", null], [{}]]) {
    assert.throws(
      () => normalizeRoles(value),
      (err) => err instanceof ValidationError && err.field === "roles",
    );
  }
});

test("roles: rejects other types", () => {
  assert.throws(() => normalizeRoles(5), ValidationError);
  assert.throws(() => normalizeRoles({}), ValidationError);
});

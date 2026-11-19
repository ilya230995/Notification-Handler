import test from "node:test";
import assert from "node:assert/strict";
import { assertEmail } from "../../app/lib/email.js";
import { ValidationError } from "../../app/lib/errors.js";

test("email: valid", () => {
  assert.equal(assertEmail("alice@example.com"), "alice@example.com");
});

test("email: trims and lowercases domain", () => {
  assert.equal(assertEmail("  Carol@Example.COM "), "Carol@example.com");
});

test("email: rejects (at) form", () => {
  assert.throws(
    () => assertEmail("bob.smith(at)example.com"),
    (err) => err instanceof ValidationError && err.field === "email",
  );
});

test("email: rejects missing/non-string", () => {
  for (const value of [undefined, "", 42]) {
    assert.throws(() => assertEmail(value), ValidationError);
  }
});

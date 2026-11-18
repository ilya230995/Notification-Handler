import test from "node:test";
import assert from "node:assert/strict";
import { toIsoDate } from "../../app/lib/dates.js";
import { ValidationError } from "../../app/lib/errors.js";

const accepted = [
  ["2021-04-01", "2021-04-01T00:00:00.000Z"],
  ["2021-07-15T00:00:00", "2021-07-15T00:00:00.000Z"],
  ["2021/06/01 10:23+02:00", "2021-06-01T08:23:00.000Z"],
  ["2021/06/01", "2021-06-01T00:00:00.000Z"],
  ["April 5th, 2021 13:45 PST", "2021-04-05T21:45:00.000Z"],
  ["Apr 5, 2021 13:45 EDT", "2021-04-05T17:45:00.000Z"],
  ["April 1st, 2021", "2021-04-01T00:00:00.000Z"],
  ["2021-04-01T10:00:00+03:00", "2021-04-01T07:00:00.000Z"],
];

for (const [input, expected] of accepted) {
  test(`dates: accepts ${JSON.stringify(input)}`, () => {
    assert.equal(toIsoDate(input, "date"), expected);
  });
}

test("dates: rejects unparseable and ambiguous values", () => {
  const rejected = [
    "yesterday",
    "1617235200",
    1617235200,
    "04/05/2021",
    "April 5th, 2021 13:45 CET",
    "",
    null,
    "2021-02-30",
  ];
  for (const value of rejected) {
    assert.throws(
      () => toIsoDate(value, "date"),
      (err) => err instanceof ValidationError && err.field === "date",
      `expected ${JSON.stringify(value)} to be rejected`,
    );
  }
});

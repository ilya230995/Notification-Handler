import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { insertToMySQL } from "../../app/db/mysql.js";

test("insertToMySQL resolves with a numeric notificationId", async () => {
  const write = mock.method(process.stderr, "write", () => true);
  try {
    const { notificationId } = await insertToMySQL({ NotificationTypeID: 1 });
    assert.equal(typeof notificationId, "number");
  } finally {
    write.mock.restore();
  }
});

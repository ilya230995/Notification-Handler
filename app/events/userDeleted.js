import { assertEmail } from "../lib/email.js";
import { toIsoDate } from "../lib/dates.js";

export default {
  type: "user_deleted",
  notificationTypeId: 3,
  normalize(raw) {
    return {
      email: assertEmail(raw.email),
      deleted: toIsoDate(raw.deleted, "deleted"),
    };
  },
};

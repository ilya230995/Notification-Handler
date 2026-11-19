import { assertEmail } from "../lib/email.js";
import { toIsoDate } from "../lib/dates.js";

export default {
  type: "password_reset",
  notificationTypeId: 2,
  normalize(raw) {
    return {
      email: assertEmail(raw.email),
      requested: toIsoDate(raw.requested, "requested"),
    };
  },
};

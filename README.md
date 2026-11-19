# Notification Handler

An AWS Lambda handler that takes a batch of semi-structured user events, validates and normalizes each one, and passes the valid ones to `insertToMySQL` as rows shaped like the `Notification` table. Invalid, unknown and duplicate events are reported with a reason; one bad event never stops the batch.

Supported event types: `user_registered`, `password_reset`, `user_deleted`.

## Requirements

- Node.js 22 or later (the Lambda runtime is `nodejs22.x`).
- Runtime dependencies: `luxon` (date parsing) and `validator` (email validation).

## Setup

```sh
npm install
```

## Running locally

```sh
node app/run.js --input sample/events.json --log-level INFO
# or
npm start
```

| Option | Meaning |
|--------|---------|
| `--input <file>` | Required. A JSON file holding an array of events, or `{ "events": [...] }`. |
| `--log-level <level>` | `DEBUG`, `INFO` (default), `WARN` or `ERROR`, case-insensitive. Entries below the level are dropped. |
| `-h`, `--help` | Prints usage and exits. |

The two output streams are kept separate:

- **stdout** gets the human-readable summary report, so it can be piped or diffed on its own.
- **stderr** gets the logs, one JSON object per line, in the same format the function writes to CloudWatch.

Exit codes:

- `0`: the batch ran, even if some events were rejected, skipped or failed. The per-event outcome is in the report.
- `1`: a usage or input error, such as a missing `--input`, an unreadable file, invalid JSON, a payload that is not an array, an unknown log level or an unknown option. An `Error: ...` line is printed to stderr, followed by the usage line when `--input` is missing.

### Sample output

stdout for `sample/events.json`:

```text
Processed 7 events: 4 stored, 2 rejected, 1 skipped, 0 failed

#  type             event_id  status    reason
-  ---------------  --------  --------  -----------------------------------------
0  user_registered  -         stored    -
1  user_registered  -         rejected  invalid: email: not a valid email address
2  password_reset   -         stored    -
3  user_deleted     -         stored    -
4  unknown_type     -         rejected  unknown_type
5  user_registered  dedupe-1  stored    -
6  user_registered  dedupe-1  skipped   duplicate
```

An excerpt from stderr at `INFO` (the full run has one `insertToMySQL` line per stored event, one line per rejected or skipped event, and a final `batch processed` line):

```text
{"level":"INFO","msg":"insertToMySQL","notificationId":1,"row":{"NotificationTypeID":1,"NotificationData":{"name":"Alice","email":"alice@example.com","roles":["admin","editor","manager"],"joined":"2021-04-01T00:00:00.000Z"},"Status":0,"CreatedByType":0,"CreatedByID":0,"Seen":0,"IsBookmarked":0}}
{"level":"WARN","msg":"rejected","index":1,"type":"user_registered","eventId":null,"reason":"invalid: email: not a valid email address"}
{"level":"WARN","msg":"skipped","index":6,"type":"user_registered","eventId":"dedupe-1","reason":"duplicate"}
{"level":"INFO","msg":"batch processed","total":7,"stored":4,"rejected":2,"skipped":1,"failed":0,"requestId":"local-1795037220346"}
```

With `--log-level WARN` only the three WARN lines remain. The `requestId` is the Lambda request ID; the CLI fills it with `local-<timestamp>`.

## Tests and lint

```sh
npm test                                  # node --test, all files under test/
node --test test/lib/dates.test.js        # a single file
npm run lint                              # eslint app test
```

The tests use only `node:test` and `node:assert`. They cover each normalizer, the logger, each event descriptor and the registry, the pipeline (dedupe, malformed items, insert failures in the middle of a batch, ordering), the handler, the report and the CLI end to end on `sample/events.json`.

## Architecture

```text
app/
  handler.js          Lambda entry: unwraps the payload, runs the pipeline, logs the summary
  run.js              CLI entry: reads a file, calls the handler, prints the report
  pipeline.js         processEvents and toNotificationRow
  report.js           formats the summary table for stdout
  db/mysql.js         insertToMySQL stub
  events/
    index.js          registry of event descriptors
    userRegistered.js
    passwordReset.js
    userDeleted.js
  lib/
    roles.js          normalizeRoles
    email.js          assertEmail
    dates.js          toIsoDate
    errors.js         ValidationError
    logger.js         JSON-lines logger with levels
sample/
  events.json         input for the CLI
  lambda-event.json   the same events as a Lambda test event
test/                 mirrors app/
template.yaml         SAM template
```

The handler accepts either a bare array of events or `{ "events": [...] }`. Any other payload throws a `TypeError`, which fails the invocation, since that is a caller error rather than a bad event. It returns `{ summary, results }`, where `summary` holds counts by status and `results` holds one record per input event: `{ index, type, eventId, status, reason?, notificationId? }`.

`processEvents` handles each event in input order:

1. **Shape check.** An item that is not a plain object, or has no non-empty string `type`, is rejected as `malformed`.
2. **Lookup.** A `type` not in the registry is rejected as `unknown_type`.
3. **Event ID check.** A missing or `null` `event_id` means the event has no ID. Any other value that is not a non-empty string, such as `""` or `42`, is rejected as `invalid: event_id: must be a non-empty string`.
4. **Dedupe.** An `event_id` already stored in this batch is skipped as `duplicate`.
5. **Normalize.** The descriptor's `normalize(raw)` runs. A `ValidationError` rejects the event as `invalid: <field>: <reason>`. Any other error marks it `failed`.
6. **Map** the normalized payload to a `Notification` row.
7. **Persist** with `await insertToMySQL(row)`. If the insert throws, the event is `failed` with `error: <message>` and the batch continues.

| Status | Log level | When |
|--------|-----------|------|
| `stored` | INFO (from the stub) | inserted |
| `rejected` | WARN | `malformed`, `unknown_type` or `invalid: ...` |
| `skipped` | WARN | `duplicate` |
| `failed` | ERROR | unexpected error in a descriptor or in the insert |

`insertToMySQL` is a stub. It logs the row at INFO and returns an incrementing `notificationId`, which restarts at 1 on every invocation. The handler builds a fresh stub with `createMySqlStub` per invocation; the named `insertToMySQL` export in `app/db/mysql.js` is the standalone stub the assignment names, with one shared counter.

## Normalization rules

**Roles** (`user_registered` only):

- A string is split on `,`. An array must contain only strings; any non-string entry rejects the event.
- `null` or a missing field becomes `[]`. Any other type rejects the event.
- Entries are trimmed, empty entries are dropped, and duplicates are removed keeping the first occurrence. Letter case is kept.
- Example: `"admin, editor ,  manager"` becomes `["admin", "editor", "manager"]`; `["viewer", " "]` becomes `["viewer"]`.

**Email:** the value is trimmed and checked with `validator`'s `isEmail`. An invalid address, such as `bob.smith(at)example.com`, rejects the event. The domain is lowercased and the local part is kept as given: `Carol@Example.COM` becomes `Carol@example.com`.

**Name** (`user_registered`): must be a non-empty string, and is trimmed.

**Dates** are always output in UTC as `DateTime#toUTC().toISO()`, for example `2021-04-01T00:00:00.000Z`. An input with no zone or offset is read as UTC. Partial ISO dates such as `2021-04` are read as the first day of the period (a bare year such as `2021` is rejected as numeric). These forms are tried in order:

| Form | Example input | Output |
|------|---------------|--------|
| ISO 8601 | `2021-04-01` | `2021-04-01T00:00:00.000Z` |
| ISO 8601 with time | `2021-07-15T00:00:00` | `2021-07-15T00:00:00.000Z` |
| ISO 8601 with offset | `2021-04-01T10:00:00+03:00` | `2021-04-01T07:00:00.000Z` |
| `yyyy/MM/dd HH:mmZZ` | `2021/06/01 10:23+02:00` | `2021-06-01T08:23:00.000Z` |
| `yyyy/MM/dd` | `2021/06/01` | `2021-06-01T00:00:00.000Z` |
| Month name, optional time, optional zone after the time | `April 5th, 2021 13:45 PST` | `2021-04-05T21:45:00.000Z` |
| Short month name | `Apr 5, 2021 13:45 EDT` | `2021-04-05T17:45:00.000Z` |

Ordinal suffixes (`1st`, `5th`) are stripped. Month names and zone abbreviations are case-insensitive (`pst` works like `PST`). A trailing zone abbreviation, accepted only after a time (`April 5, 2021 PST` is rejected), is replaced by its fixed offset:

| Abbreviation | Offset |
|--------------|--------|
| `PST` / `PDT` | −08:00 / −07:00 |
| `MST` / `MDT` | −07:00 / −06:00 |
| `CST` / `CDT` | −06:00 / −05:00 |
| `EST` / `EDT` | −05:00 / −04:00 |
| `UTC`, `GMT` | +00:00 |

Rejected inputs:

- numbers and numeric strings such as `1617235200`, because the unit (seconds or milliseconds) is ambiguous;
- day/month-ambiguous dates such as `04/05/2021`, which read as April 5 or May 4 depending on locale;
- other zone abbreviations such as `CET` or `BST`, in any letter case;
- a time with no date, such as `10:00` or `10:00:00Z`, which would otherwise be read as today;
- strings longer than 64 characters (`too long`);
- relative words such as `yesterday`, whose value depends on when the code runs;
- impossible dates such as `2021-02-30`, and empty or non-string values.

## Deduplication

- Only events with an `event_id` take part. Events without one are never treated as duplicates, even if their content is identical.
- The first copy that is **stored** wins. Later copies with the same `event_id` are skipped with the reason `duplicate`.
- An `event_id` is marked as seen only after `insertToMySQL` succeeds. A copy that is rejected as invalid, or whose insert fails, does not block a later valid copy.
- The scope is one invocation. The set of seen IDs is not persisted.

## Mapping to the `Notification` table

| Column | Value |
|--------|-------|
| `NotificationTypeID` | from the event type (table below) |
| `NotificationData` | the normalized payload, plus `event_id` when the event has one |
| `Status` | `0` |
| `CreatedByType` | `0` |
| `CreatedByID` | `0` |
| `Seen` | `0` |
| `IsBookmarked` | `0` |
| `Created` | omitted; left to the database default |

| Event type | `NotificationTypeID` | `NotificationData` fields |
|------------|----------------------|---------------------------|
| `user_registered` | 1 | `name`, `email`, `roles`, `joined` |
| `password_reset` | 2 | `email`, `requested` |
| `user_deleted` | 3 | `email`, `deleted` |

Fields not listed are dropped, so the event's `type` and any unknown keys do not reach the row.

## Adding a new event type

The pipeline does not change. A new type takes one file, one registry line and a test.

1. Create `app/events/<name>.js` with a default export of `{ type, notificationTypeId, normalize(raw) }`. `normalize` returns the `NotificationData` payload and throws a `ValidationError` for bad input. The helpers in `app/lib/` already do this: `assertEmail(value, field = "email")`, `toIsoDate(value, field)` and `normalizeRoles(value)`.

   ```js
   // app/events/emailChanged.js
   import { assertEmail } from "../lib/email.js";
   import { toIsoDate } from "../lib/dates.js";

   export default {
     type: "email_changed",
     notificationTypeId: 4,
     normalize(raw) {
       return {
         oldEmail: assertEmail(raw.oldEmail, "oldEmail"),
         newEmail: assertEmail(raw.newEmail, "newEmail"),
         changed: toIsoDate(raw.changed, "changed"),
       };
     },
   };
   ```

2. Import it in `app/events/index.js` and add it to the `buildRegistry([...])` list:

   ```js
   import emailChanged from "./emailChanged.js";

   export const registry = buildRegistry([userRegistered, passwordReset, userDeleted, emailChanged]);
   ```

   `buildRegistry` throws `Duplicate event type: <type>` at startup if two descriptors share a `type`.

3. Add a test in `test/events/descriptors.test.js` for a valid event and for each rejected field, and update the registry test that lists the type IDs. Run `npm test`.

An invalid `newEmail` in the example above is reported as `invalid: newEmail: not a valid email address`.

## Deploying with SAM (optional)

`template.yaml` is a minimal deploy example: one `nodejs22.x` function with handler `app/handler.handler`, a 30-second timeout and `LOG_LEVEL=INFO`. It is not needed to run or test the project. Invoking it locally requires the AWS SAM CLI and Docker:

```sh
sam local invoke NotificationHandlerFunction -e sample/lambda-event.json
```

Inside Lambda the log level comes from the `LOG_LEVEL` environment variable. An invalid value fails the invocation before any event is processed.

## Design decisions

- **A registry instead of a `switch`.** Each event type is a self-contained descriptor, so adding a type does not touch the pipeline, and each type can be tested on its own.
- **Dependencies are injected.** `createHandler` receives `insertToMySQL` and the logger, and `processEvents` also accepts a `registry` (defaulting to the real one), so tests pass in fakes without module mocking.
- **Zone abbreviations are fixed offsets.** `PST` always means −08:00. Mapping it to `America/Los_Angeles` would silently apply daylight saving time to a date that explicitly says standard time.
- **Ambiguous dates are rejected, not guessed.** Epoch numbers, `04/05/2021` and `CET` each have more than one plausible reading. A wrong date stored silently is worse than a rejection with a clear reason.
- **The first stored copy wins.** An `event_id` is marked as seen only after a successful insert, so a retry after an invalid copy or a failed insert still goes through.
- **`CreatedByType` and `CreatedByID` are 0.** The events are system-generated and carry no numeric user ID to attribute them to.
- **Only the email domain is lowercased.** Domains are case-insensitive, but the local part may be case-sensitive on some mail servers, so it is kept as given.
- **Events are processed one at a time.** Sequential processing keeps dedupe deterministic and the log lines in input order.
- **The report goes to stdout, logs to stderr.** Either stream can be redirected without mixing in the other.
- **Exit codes separate caller errors from event errors.** Bad events are an expected part of a batch and are reported per event with exit code 0. Exit code 1 is kept for a run that could not process the batch at all.

## Possible extensions

- A real MySQL adapter (for example `mysql2` with a parameterized `INSERT`) behind the same `insertToMySQL(row)` interface.
- Persistent dedupe across invocations, such as a unique key on `event_id` or a DynamoDB conditional write.
- SQS as the trigger, returning `batchItemFailures` so only failed messages are retried.
- A `NotificationType` lookup table instead of the type IDs fixed in the descriptors.

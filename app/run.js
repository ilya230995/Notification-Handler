import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createHandler } from "./handler.js";
import { createLogger } from "./lib/logger.js";
import { createMySqlStub } from "./db/mysql.js";
import { formatReport } from "./report.js";

const USAGE = "Usage: node app/run.js --input <events.json> [--log-level DEBUG|INFO|WARN|ERROR]";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "log-level": { type: "string", default: "INFO" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (!values.input) throw new Error(`--input is required\n${USAGE}`);
  const logger = createLogger({ level: values["log-level"] });

  let text;
  try {
    text = await readFile(values.input, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${values.input}: ${err.message}`, { cause: err });
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(`${values.input} is not valid JSON: ${err.message}`, { cause: err });
  }

  const { insertToMySQL } = createMySqlStub({ logger });
  const handler = createHandler({ logger, insertToMySQL });
  const result = await handler(payload, { awsRequestId: `local-${Date.now()}` });
  process.stdout.write(`${formatReport(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});

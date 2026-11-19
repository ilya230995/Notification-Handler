const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];

/**
 * Creates a logger that writes one JSON object per line, dropping entries below `level`.
 * @param {{ level?: string, write?: (line: string) => void }} [options]
 * @returns {{ debug: LogFn, info: LogFn, warn: LogFn, error: LogFn }}
 * @typedef {(msg: string, context?: object) => void} LogFn
 */
export function createLogger({
  level = "INFO",
  write = (line) => process.stderr.write(line + "\n"),
} = {}) {
  const threshold = LEVELS.indexOf(String(level).toUpperCase());
  if (threshold === -1) {
    throw new Error(`Unknown log level "${level}". Valid levels: ${LEVELS.join(", ")}`);
  }

  const log = (name) => (msg, context) => {
    if (LEVELS.indexOf(name) < threshold) return;
    // Spread twice so level and msg come first and context can't overwrite them.
    const head = { level: name, msg };
    write(JSON.stringify({ ...head, ...context, ...head }));
  };

  return {
    debug: log("DEBUG"),
    info: log("INFO"),
    warn: log("WARN"),
    error: log("ERROR"),
  };
}

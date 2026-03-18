// src/utils/logger.js

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLORS = {
  error: "\x1b[31m",   // red
  warn:  "\x1b[33m",   // yellow
  info:  "\x1b[36m",   // cyan
  debug: "\x1b[90m",   // grey
  reset: "\x1b[0m",
};

const ICONS = {
  error: "❌",
  warn:  "⚠️ ",
  info:  "ℹ️ ",
  debug: "🔍",
};

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(level, ...args) {
  if (LEVELS[level] > currentLevel) return;

  const color  = COLORS[level];
  const reset  = COLORS.reset;
  const icon   = ICONS[level];
  const prefix = `${color}[${timestamp()}] ${icon} ${level.toUpperCase()}${reset}`;

  const message = args
    .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
    .join(" ");

  console.log(`${prefix}  ${message}`);
}

export const logger = {
  error: (...args) => log("error", ...args),
  warn:  (...args) => log("warn",  ...args),
  info:  (...args) => log("info",  ...args),
  debug: (...args) => log("debug", ...args),

  /** Pretty-print a campaign summary table */
  summary(data) {
    console.log("\n" + "─".repeat(52));
    console.log("  📊 CAMPAIGN SUMMARY");
    console.log("─".repeat(52));
    for (const [key, val] of Object.entries(data)) {
      const label = key.padEnd(20);
      console.log(`  ${label}  ${val}`);
    }
    console.log("─".repeat(52) + "\n");
  },
};
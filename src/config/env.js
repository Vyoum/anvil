// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`❌ Missing required environment variable: ${key}`);
  return val;
}

function optional(key, fallback) {
  return process.env[key] || fallback;
}

function optionalInt(key, fallback) {
  const val = process.env[key];
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

// ─── Env Config ───────────────────────────────────────────────────────────────

export const env = {

  // ── Sending Limits ────────────────────────────────────────────────────────
  dailyLimit:  optionalInt("DAILY_LIMIT",  50),
  hourlyLimit: optionalInt("HOURLY_LIMIT", 10),

  // Human-like delay between emails (ms)
  minDelayMs:  optionalInt("MIN_DELAY_MS", 30_000),   // 30 seconds
  maxDelayMs:  optionalInt("MAX_DELAY_MS", 120_000),  // 2 minutes

  // ── OpenAI ────────────────────────────────────────────────────────────────
  openaiApiKey: optional("OPENAI_API_KEY", null),
  openaiModel:  optional("OPENAI_MODEL", "gpt-4o"),

  // ── Google Sheets ─────────────────────────────────────────────────────────
  googleSheetId:              optional("GOOGLE_SHEET_ID", null),
  googleServiceAccountEmail:  optional("GOOGLE_SERVICE_ACCOUNT_EMAIL", null),
  googleServiceAccountKey:    optional("GOOGLE_SERVICE_ACCOUNT_KEY", null),

  // ── SMTP ──────────────────────────────────────────────────────────────────
  smtpHost: optional("SMTP_HOST", null),
  smtpPort: optionalInt("SMTP_PORT", 587),
  smtpUser: optional("SMTP_USER", null),
  smtpPass: optional("SMTP_PASS", null),

  // ── App ───────────────────────────────────────────────────────────────────
  appUrl:       optional("APP_URL",    "http://localhost:3000"),
  dataDir:      optional("DATA_DIR",   "./data"),
  unsubSecret:  optional("UNSUB_SECRET", "change_this_secret_in_production"),
  logLevel:     optional("LOG_LEVEL",  "info"),

  // ── Retry Config ──────────────────────────────────────────────────────────
  smtpMaxRetries:   optionalInt("SMTP_MAX_RETRIES",    2),
  smtpRetryDelayMs: optionalInt("SMTP_RETRY_DELAY_MS", 5_000),
};

// ─── Runtime Validation ───────────────────────────────────────────────────────
// Warn (not crash) on startup if critical vars are missing,
// so you get a clear message instead of a cryptic runtime error.

const warnings = [];

if (!env.openaiApiKey)             warnings.push("OPENAI_API_KEY    — AI email writing disabled, fallback templates will be used");
if (!env.googleSheetId)            warnings.push("GOOGLE_SHEET_ID   — leads cannot be fetched from Google Sheets");
if (!env.googleServiceAccountEmail) warnings.push("GOOGLE_SERVICE_ACCOUNT_EMAIL — Google Sheets auth will fail");
if (!env.googleServiceAccountKey)  warnings.push("GOOGLE_SERVICE_ACCOUNT_KEY   — Google Sheets auth will fail");
if (!env.smtpHost)                 warnings.push("SMTP_HOST         — emails cannot be sent");
if (!env.smtpUser)                 warnings.push("SMTP_USER         — emails cannot be sent");
if (!env.smtpPass)                 warnings.push("SMTP_PASS         — emails cannot be sent");
if (env.unsubSecret === "change_this_secret_in_production")
                                   warnings.push("UNSUB_SECRET      — using default secret, change this before going live");

if (warnings.length > 0) {
  console.warn("\n⚠️  Missing environment variables:");
  warnings.forEach((w) => console.warn(`   • ${w}`));
  console.warn("");
}
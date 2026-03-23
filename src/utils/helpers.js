// src/utils/helpers.js
import crypto from "crypto";
import fs     from "fs/promises";
import path   from "path";
import { env } from "../config/env.js";

// ─── Sleep ────────────────────────────────────────────────────────────────────

/**
 * Pause execution for a given number of milliseconds.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Random Delay ─────────────────────────────────────────────────────────────

/**
 * Generate a random delay between minMs and maxMs.
 * Falls back to env values (30s–2min) so sleep() never receives NaN.
 *
 * @param {number} [minMs]
 * @param {number} [maxMs]
 * @returns {number} milliseconds
 */
export function randomDelay(
  minMs = env.minDelayMs ?? 30_000,
  maxMs = env.maxDelayMs ?? 120_000
) {
  const lo = Number.isFinite(minMs) ? minMs : 30_000;
  const hi = Number.isFinite(maxMs) ? maxMs : 120_000;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

export function uuid() {
  return crypto.randomUUID();
}

// ─── Percentage ───────────────────────────────────────────────────────────────

/**
 * Returns a formatted percentage string e.g. "42.3%"
 * @param {number} numerator
 * @param {number} denominator
 */
export function pct(numerator, denominator) {
  if (!denominator || denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// ─── Deliverability Score ─────────────────────────────────────────────────────

/**
 * Calculates a 0–100 deliverability score based on bounces and spam reports.
 * Score formula:
 *   -50 points for every 100% bounce rate
 *   -100 points for every 100% spam rate
 *
 * @param {{ sent: number, bounced: number, spamReported: number }}
 * @returns {number}
 */
export function calcDeliverabilityScore({ sent, bounced, spamReported }) {
  if (!sent || sent === 0) return 100;
  const bounceRate = bounced     / sent;
  const spamRate   = spamReported / sent;
  return Math.max(0, Math.round(100 - bounceRate * 50 - spamRate * 100));
}

// ─── Unsubscribe Token (HMAC-signed, base64url) ───────────────────────────────

/**
 * Generate a tamper-proof unsubscribe token for an email address.
 * @param {string} email
 * @returns {string} base64url token
 */
export function generateUnsubToken(email) {
  const normalised = email.toLowerCase().trim();
  const hmac = crypto
    .createHmac("sha256", env.unsubSecret)
    .update(normalised)
    .digest("hex");
  return Buffer.from(`${normalised}:${hmac}`).toString("base64url");
}

/**
 * Decode and verify an unsubscribe token.
 * @param {string} token
 * @returns {string|null} email if valid, null if tampered
 */
export function decodeUnsubToken(token) {
  try {
    const decoded  = Buffer.from(token, "base64url").toString("utf8");
    const colonIdx = decoded.lastIndexOf(":");
    const email    = decoded.slice(0, colonIdx);
    const hmac     = decoded.slice(colonIdx + 1);

    const expected = crypto
      .createHmac("sha256", env.unsubSecret)
      .update(email)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(hmac,     "hex");

    if (expectedBuf.length !== receivedBuf.length) return null;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf) ? email : null;
  } catch {
    return null;
  }
}

// ─── Email Tracking ───────────────────────────────────────────────────────────

/**
 * Build a 1x1 tracking pixel URL for open tracking.
 * @param {string} emailId
 */
export function buildTrackingPixelUrl(emailId) {
  return `${env.appUrl}/track/open/${emailId}`;
}

/**
 * Wrap all external links in an email body with click-tracking URLs.
 * Skips unsubscribe links and already-tracked links.
 *
 * @param {string} html
 * @param {string} emailId
 * @returns {string}
 */
export function wrapLinksForTracking(html, emailId) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes("/unsubscribe") || url.includes("/track/")) return match;
    const wrapped = `${env.appUrl}/track/click/${emailId}?redirect=${encodeURIComponent(url)}`;
    return `href="${wrapped}"`;
  });
}

// ─── JSON File Store ──────────────────────────────────────────────────────────
// Lightweight persistence layer — no database needed.
// All data is stored as JSON arrays in the configured DATA_DIR.

export const store = {

  /**
   * Read a JSON file. Returns null if file doesn't exist.
   * @param {string} filename
   * @returns {Promise<Array|Object|null>}
   */
  async read(filename) {
    const filePath = path.join(env.dataDir, filename);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return null;  // File doesn't exist yet — not an error
      throw err;
    }
  },

  /**
   * Write (overwrite) a JSON file.
   * @param {string}       filename
   * @param {Array|Object} data
   */
  async write(filename, data) {
    await fs.mkdir(env.dataDir, { recursive: true });
    const filePath = path.join(env.dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  },

  /**
   * Append a single record to a JSON array file.
   * Creates the file if it doesn't exist.
   *
   * @param {string} filename
   * @param {Object} record
   */
  async append(filename, record) {
    const existing = (await this.read(filename)) || [];
    if (!Array.isArray(existing)) throw new Error(`${filename} is not a JSON array.`);
    existing.push({ ...record, _savedAt: new Date().toISOString() });
    await this.write(filename, existing);
  },

  /**
   * Update all records matching matchFn by merging the result of updateFn.
   *
   * @param {string}   filename
   * @param {Function} matchFn  - (record) => boolean
   * @param {Function} updateFn - (record) => Partial<record>
   */
  async update(filename, matchFn, updateFn) {
    const records = (await this.read(filename)) || [];
    const updated = records.map((r) =>
      matchFn(r) ? { ...r, ...updateFn(r), _updatedAt: new Date().toISOString() } : r
    );
    await this.write(filename, updated);
  },

  /**
   * Return all records matching matchFn.
   *
   * @param {string}   filename
   * @param {Function} matchFn - (record) => boolean
   * @returns {Promise<Array>}
   */
  async find(filename, matchFn) {
    const records = (await this.read(filename)) || [];
    return records.filter(matchFn);
  },

  /**
   * Delete all records matching matchFn.
   *
   * @param {string}   filename
   * @param {Function} matchFn - (record) => boolean
   * @returns {Promise<number>} count of deleted records
   */
  async remove(filename, matchFn) {
    const records = (await this.read(filename)) || [];
    const kept    = records.filter((r) => !matchFn(r));
    await this.write(filename, kept);
    return records.length - kept.length;
  },

  /**
   * Return the count of all records in a file.
   * @param {string} filename
   * @returns {Promise<number>}
   */
  async count(filename) {
    const records = (await this.read(filename)) || [];
    return records.length;
  },
};
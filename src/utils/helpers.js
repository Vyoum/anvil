// src/utils/helpers.js
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.js";

// ─── Sleep ────────────────────────────────────────────────────────────────────

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Random delay within a range ─────────────────────────────────────────────

export function randomDelay(minMs = env.minDelayMs, maxMs = env.maxDelayMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// ─── Unsubscribe token (HMAC-signed, base64url) ───────────────────────────────

export function generateUnsubToken(email) {
  const hmac = crypto
    .createHmac("sha256", env.unsubSecret)
    .update(email.toLowerCase())
    .digest("hex");
  return Buffer.from(`${email.toLowerCase()}:${hmac}`).toString("base64url");
}

export function decodeUnsubToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const colonIdx = decoded.lastIndexOf(":");
    const email    = decoded.slice(0, colonIdx);
    const hmac     = decoded.slice(colonIdx + 1);
    const expected = crypto
      .createHmac("sha256", env.unsubSecret)
      .update(email)
      .digest("hex");
    return hmac === expected ? email : null;
  } catch {
    return null;
  }
}

// ─── Email tracking link wrapper ──────────────────────────────────────────────

export function buildTrackingPixelUrl(emailId) {
  return `${env.appUrl}/track/open/${emailId}`;
}

export function wrapLinksForTracking(html, emailId) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes("/unsubscribe") || url.includes("/track/")) return match;
    const wrapped = `${env.appUrl}/track/click/${emailId}?redirect=${encodeURIComponent(url)}`;
    return `href="${wrapped}"`;
  });
}

// ─── JSON file store (lightweight persistence — no DB needed) ─────────────────

export const store = {
  async read(filename) {
    const filePath = path.join(env.dataDir, filename);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async write(filename, data) {
    await fs.mkdir(env.dataDir, { recursive: true });
    const filePath = path.join(env.dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  },

  async append(filename, record) {
    const existing = (await this.read(filename)) || [];
    existing.push(record);
    await this.write(filename, existing);
  },

  async update(filename, matchFn, updateFn) {
    const records = (await this.read(filename)) || [];
    const updated = records.map((r) => (matchFn(r) ? { ...r, ...updateFn(r) } : r));
    await this.write(filename, updated);
  },

  async find(filename, matchFn) {
    const records = (await this.read(filename)) || [];
    return records.filter(matchFn);
  },
};

// ─── Misc ────────────────────────────────────────────────────────────────────

export function calcDeliverabilityScore({ sent, bounced, spamReported }) {
  if (sent === 0) return 100;
  const bounceRate = bounced / sent;
  const spamRate   = spamReported / sent;
  return Math.max(0, Math.round(100 - bounceRate * 50 - spamRate * 100));
}

export function pct(numerator, denominator) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function uuid() {
  return crypto.randomUUID();
}
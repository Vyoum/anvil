// src/utils/helpers.js
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const uuid = () => uuidv4();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const randomDelay = (min = 2000, max = 5000) => 
  Math.floor(Math.random() * (max - min + 1)) + min;

export const pct = (numerator, denominator) => 
  denominator === 0 ? "0%" : `${Math.round((numerator / denominator) * 100)}%`;

export const calcDeliverabilityScore = ({ sent, bounced, spamReported }) => {
  if (sent === 0) return 100;
  const health = 100 - ((bounced * 2 + spamReported * 5) / sent) * 100;
  return Math.max(0, Math.round(health));
};

export const store = {
  async read(filename) {
    try {
      const data = await fs.readFile(path.join(process.cwd(), "data", filename), "utf8");
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  },

  async append(filename, record) {
    const dataDir = path.join(process.cwd(), "data");
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const existing = await this.read(filename) || [];
      existing.push(record);
      await fs.writeFile(path.join(dataDir, filename), JSON.stringify(existing, null, 2));
    } catch (err) {
      console.error(`Error appending to ${filename}:`, err);
    }
  },

  async find(filename, predicate) {
    const data = await this.read(filename) || [];
    return data.filter(predicate);
  },

  async update(filename, predicate, updateFn) {
    const dataDir = path.join(process.cwd(), "data");
    const existing = await this.read(filename) || [];
    const updated = existing.map(item => predicate(item) ? { ...item, ...updateFn(item) } : item);
    await fs.writeFile(path.join(dataDir, filename), JSON.stringify(updated, null, 2));
  }
};

export const decodeUnsubToken = (token) => {
  try {
    return Buffer.from(token, "base64").toString("utf8");
  } catch (err) {
    return null;
  }
};

/**
 * Parses spintax like {Hi|Hello|Hey} into a random selection.
 */
export const parseSpintax = (text) => {
  if (!text) return text;
  return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
    const options = choices.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
};

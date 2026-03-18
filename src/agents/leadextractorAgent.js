// src/agents/leadExtractorAgent.js
import { fetchLeadsFromSheet } from "../services/googleSheetsService.js";
import { store } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

// Fields a lead must have to be considered valid
const REQUIRED_FIELDS = ["email"];

export class LeadExtractorAgent {
  /**
   * Fetch, validate, deduplicate, and return all usable leads.
   * @returns {Promise<Array<Object>>}
   */
  async getLeads() {
    logger.info("[LeadExtractor] Extracting leads from Google Sheets...");

    const rawLeads = await fetchLeadsFromSheet();
    const { valid, skipped } = this._validate(rawLeads);

    if (skipped.length > 0) {
      logger.warn(`[LeadExtractor] Skipped ${skipped.length} invalid rows:`, skipped.map((r) => r._reason));
    }

    const deduplicated = this._deduplicate(valid);

    logger.info(
      `[LeadExtractor] ${deduplicated.length} leads ready (${rawLeads.length} raw → ${skipped.length} invalid → ${valid.length - deduplicated.length} duplicate)`
    );

    return deduplicated;
  }

  /**
   * Validate leads — check required fields and email format.
   * @param {Array<Object>} leads
   * @returns {{ valid: Array, skipped: Array }}
   */
  _validate(leads) {
    const valid   = [];
    const skipped = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const lead of leads) {
      const missingField = REQUIRED_FIELDS.find((f) => !lead[f]);
      if (missingField) {
        skipped.push({ ...lead, _reason: `Missing field: ${missingField}` });
        continue;
      }

      if (!emailRe.test(lead.email)) {
        skipped.push({ ...lead, _reason: `Invalid email: ${lead.email}` });
        continue;
      }

      // Normalize email to lowercase
      lead.email = lead.email.toLowerCase().trim();
      valid.push(lead);
    }

    return { valid, skipped };
  }

  /**
   * Remove duplicate emails — keep the first occurrence.
   * @param {Array<Object>} leads
   */
  _deduplicate(leads) {
    const seen = new Set();
    return leads.filter((lead) => {
      if (seen.has(lead.email)) return false;
      seen.add(lead.email);
      return true;
    });
  }

  /**
   * Filter leads against a known unsubscribe + bounce list.
   * @param {Array<Object>} leads
   * @param {string}        campaignId
   */
  async filterSuppressed(leads, campaignId) {
    // Load unsubscribed list
    const unsubRecords  = (await store.read("unsubscribes.json"))  || [];
    const emailLogRecords = (await store.read("emailLogs.json"))   || [];

    const unsubSet   = new Set(unsubRecords.map((r) => r.email.toLowerCase()));
    const bouncedSet = new Set(
      emailLogRecords
        .filter((r) => r.status === "bounced" || r.status === "spam_reported")
        .map((r) => r.email.toLowerCase())
    );
    const sentInCampaign = new Set(
      emailLogRecords
        .filter((r) => r.campaignId === campaignId && r.status === "sent")
        .map((r) => r.email.toLowerCase())
    );

    const suppressed = { unsub: 0, bounced: 0, alreadySent: 0 };

    const filtered = leads.filter((lead) => {
      const email = lead.email.toLowerCase();
      if (unsubSet.has(email))        { suppressed.unsub++;       return false; }
      if (bouncedSet.has(email))      { suppressed.bounced++;     return false; }
      if (sentInCampaign.has(email))  { suppressed.alreadySent++; return false; }
      return true;
    });

    logger.info(
      `[LeadExtractor] Suppressed: ${suppressed.unsub} unsubscribed, ` +
      `${suppressed.bounced} bounced/spam, ${suppressed.alreadySent} already sent`
    );

    return filtered;
  }
}
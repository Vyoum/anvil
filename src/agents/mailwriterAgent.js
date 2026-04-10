// src/agents/mailWriterAgent.js
import { generateColdEmail } from "../services/openAiservice.js";
import { env }               from "../config/env.js";
import { logger }            from "../utils/logger.js";

export class MailWriterAgent {
  /**
   * Write a cold email for a given lead + campaign config.
   * Delegates AI generation to openAiService; falls back to templates
   * if OPENAI_API_KEY is missing or the API call fails.
   *
   * @param {Object} options
   * @param {Object} options.lead           - Lead data from Google Sheets
   * @param {Object} options.campaign       - Campaign config from runCampaign()
   * @param {string} options.templateType   - "initial" | "followup_1" | "followup_2" | "breakup"
   * @param {number} options.stepNumber     - Step index in the sequence
   * @returns {Promise<{ subject: string, body: string, previewText: string }>}
   */
  async writeColdEmail({ lead, campaign, templateType, stepNumber }) {
    // Skip AI entirely if no API key is configured
    if (!env.openaiApiKey) {
      logger.warn("[MailWriter] OPENAI_API_KEY not set — using fallback template.");
      return this._fallbackTemplate(lead, campaign, templateType);
    }

    try {
      const result = await generateColdEmail({ lead, campaign, templateType, stepNumber });
      logger.debug(`[MailWriter] AI email generated for ${lead.email} (step ${stepNumber})`);
      return result;
    } catch (err) {
      logger.warn(
        `[MailWriter] AI generation failed for ${lead.email} — using fallback template. Reason: ${err.message}`
      );
      return this._fallbackTemplate(lead, campaign, templateType);
    }
  }

  // ─── Private: Fallback Templates ────────────────────────────────────────────

  /**
   * Plain-text fallback wrapped in minimal HTML so the sender pipeline
   * (which expects HTML) can process it correctly — e.g. wrapLinksForTracking.
   *
   * @param {Object} lead
   * @param {Object} campaign
   * @param {string} templateType
   * @returns {{ subject: string, body: string, previewText: string }}
   */
  _fallbackTemplate(lead, campaign, templateType) {
    const name    = lead.firstName || lead.company || "there";
    const company = lead.company   || "your company";
    const sender  = campaign.senderName || "Anvil";

    const bodies = {
      initial: `
        <p>Hi ${name},</p>
        <p>I was looking at ${company} and had a few ideas on how ${campaign.productName} could help.</p>
        <p>${campaign.valueProposition}</p>
        <p>Would you be open to a quick chat?</p>
        <p>${sender}</p>
      `,

      followup_1: `
        <p>Hi ${name},</p>
        <p>Just following up on my last email — wanted to make sure it didn't get buried.</p>
        <p>Worth a quick conversation?</p>
        <p>${sender}</p>
      `,

      followup_2: `
        <p>Hi ${name},</p>
        <p>One last thought — ${campaign.valueProposition}.</p>
        <p>Is this something worth exploring together?</p>
        <p>${sender}</p>
      `,

      breakup: `
        <p>Hi ${name},</p>
        <p>I won't keep following up after this. If the timing ever changes, feel free to reach out.</p>
        <p>Wishing you and ${company} all the best.</p>
        <p>${sender}</p>
      `,
    };

    const body = (bodies[templateType] || bodies.initial).trim();

    return {
      subject:     `Quick question, ${name}`,
      body,
      previewText: `A quick note from ${sender}`,
    };
  }
}
// src/agents/coldMailAgent.js
import { LeadExtractorAgent } from "./leadExtractorAgent.js";
import { MailWriterAgent }    from "./mailWriterAgent.js";
import { MailSenderAgent }    from "./mailSenderAgent.js";
import { verifyConnection }   from "../services/emailService.js";
import { store, sleep, randomDelay, uuid, pct, calcDeliverabilityScore } from "../utils/helpers.js";
import { env }    from "../config/env.js";
import { logger } from "../utils/logger.js";

// ─── Follow-up sequence ───────────────────────────────────────────────────────

const DEFAULT_SEQUENCE = [
  { step: 1, dayOffset: 0,  templateType: "initial",    subjectPrefix: ""     },
  { step: 2, dayOffset: 3,  templateType: "followup_1", subjectPrefix: "Re: " },
  { step: 3, dayOffset: 7,  templateType: "followup_2", subjectPrefix: "Re: " },
  { step: 4, dayOffset: 14, templateType: "breakup",    subjectPrefix: "Re: " },
];

// ─── ColdMailAgent ────────────────────────────────────────────────────────────

export class ColdMailAgent {
  constructor() {
    this.leadExtractor = new LeadExtractorAgent();
    this.mailWriter    = new MailWriterAgent();
    this.mailSender    = new MailSenderAgent();

    // Runtime send counters (reset per campaign run)
    this._sentToday      = 0;
    this._sentThisHour   = 0;
    this._hourWindowStart = Date.now();
  }

  // ─── Public: Run Campaign ──────────────────────────────────────────────────

  /**
   * @param {Object}  config
   * @param {string}  config.campaignName       Human-readable name
   * @param {string}  config.senderName         Sender display name
   * @param {string}  config.productName        Your product / service
   * @param {string}  config.valueProposition   What you offer and why it matters
   * @param {string}  config.targetPersona      Who you're targeting
   * @param {string}  [config.painPoints]       Problems you solve
   * @param {string}  [config.cta]              Desired call-to-action
   * @param {string}  [config.tone]             Email tone (default: conversational)
   * @param {string}  [config.companyAddress]   Physical address for CAN-SPAM footer
   * @param {boolean} [config.enableFollowUps]  Enable sequence (default: true)
   * @param {number}  [config.dailyLimit]
   * @param {number}  [config.hourlyLimit]
   * @param {Object}  [config.abTest]           { enabled, variants: [{ name, subjectSuffix }] }
   * @returns {Promise<Object>}
   */
  async runCampaign(config = {}) {
    logger.info(`\n🚀 Starting campaign: "${config.campaignName || "Untitled"}"`);

    const campaignId  = uuid();
    const dailyLimit  = config.dailyLimit  || env.dailyLimit;
    const hourlyLimit = config.hourlyLimit || env.hourlyLimit;
    const sequence    = config.enableFollowUps === false
      ? [DEFAULT_SEQUENCE[0]]   // Initial email only
      : DEFAULT_SEQUENCE;

    // ── 1. SMTP health check ───────────────────────────────────────────────
    const smtpOk = await verifyConnection();
    if (!smtpOk) {
      return { success: false, message: "SMTP connection failed. Check your email credentials." };
    }

    // ── 2. Create campaign log (for crash recovery) ────────────────────────
    const existingCampaigns = (await store.read("campaigns.json")) || [];
    const existingCampaign  = existingCampaigns.find(
      (c) => c.campaignName === config.campaignName && c.status === "running"
    );

    let campaignRecord;

    if (existingCampaign) {
      logger.info(`♻️  Resuming interrupted campaign: ${existingCampaign.campaignId}`);
      campaignRecord = existingCampaign;
    } else {
      campaignRecord = {
        campaignId,
        campaignName: config.campaignName,
        status:       "running",
        startedAt:    new Date().toISOString(),
        config,
      };
      await store.append("campaigns.json", campaignRecord);
    }

    const activeCampaignId = campaignRecord.campaignId;

    // ── 3. Load + filter leads ────────────────────────────────────────────
    const allLeads  = await this.leadExtractor.getLeads();
    if (!allLeads.length) {
      await this._markCampaignComplete(activeCampaignId, [], "no_leads");
      return { success: false, message: "No valid leads found in Google Sheet." };
    }

    const leads = await this.leadExtractor.filterSuppressed(allLeads, activeCampaignId);
    logger.info(`📋 ${leads.length} leads to process (${allLeads.length - leads.length} suppressed)\n`);

    // ── 4. Send loop ──────────────────────────────────────────────────────
    const results = [];
    this._sentToday      = 0;
    this._sentThisHour   = 0;
    this._hourWindowStart = Date.now();

    for (const lead of leads) {

      // Daily cap
      if (this._sentToday >= dailyLimit) {
        logger.info(`🛑 Daily limit (${dailyLimit}) reached. Stopping for today.`);
        break;
      }

      // Hourly cap — waits automatically if exceeded
      await this._respectHourlyLimit(hourlyLimit);

      try {
        logger.info(`📨 Processing: ${lead.email}`);

        // Determine which sequence step this lead needs
        const stepDef = await this._resolveSequenceStep(lead.email, activeCampaignId, sequence);
        if (!stepDef) {
          logger.info(`  ⏭️  Skipping ${lead.email} — sequence complete or awaiting next step`);
          continue;
        }

        // Write the email
        const mailContent = await this.mailWriter.writeColdEmail({
          lead,
          campaign: config,
          templateType: stepDef.templateType,
          stepNumber:   stepDef.step,
        });

        // Apply A/B variant to subject if configured
        const subject = this._applyAbVariant(
          stepDef.subjectPrefix + mailContent.subject,
          lead.email,
          config.abTest
        );

        // Send
        const sendResult = await this.mailSender.sendMail({
          to:             lead.email,
          subject,
          html:           mailContent.body,
          previewText:    mailContent.previewText,
          companyAddress: config.companyAddress,
        });

        // Log success
        await store.append("emailLogs.json", {
          emailId:      sendResult.emailId,
          campaignId:   activeCampaignId,
          email:        lead.email,
          subject,
          step:         stepDef.step,
          templateType: stepDef.templateType,
          status:       "sent",
          messageId:    sendResult.messageId,
          abVariant:    sendResult.abVariant || null,
          sentAt:       new Date().toISOString(),
        });

        results.push({
          email:  lead.email,
          step:   stepDef.step,
          status: "sent",
          messageId: sendResult.messageId,
        });

        logger.info(`  ✅ Sent → ${lead.email} (Step ${stepDef.step}: ${stepDef.templateType})`);

        this._sentToday++;
        this._sentThisHour++;

        // Human-like random delay
        const delay = randomDelay();
        logger.debug(`  ⏳ Waiting ${Math.round(delay / 1000)}s...`);
        await sleep(delay);

      } catch (err) {
        logger.error(`  ❌ Failed → ${lead.email}: ${err.message}`);

        await store.append("emailLogs.json", {
          campaignId: activeCampaignId,
          email:      lead.email,
          status:     "failed",
          error:      err.message,
          sentAt:     new Date().toISOString(),
        });

        results.push({ email: lead.email, status: "failed", error: err.message });
      }
    }

    // ── 5. Finalize ───────────────────────────────────────────────────────
    const summary = await this._markCampaignComplete(activeCampaignId, results, "completed");

    logger.summary({
      "Campaign":   config.campaignName,
      "Total":      results.length,
      "Sent":       results.filter((r) => r.status === "sent").length,
      "Failed":     results.filter((r) => r.status === "failed").length,
      "Daily Used": `${this._sentToday} / ${dailyLimit}`,
    });

    return summary;
  }

  // ─── Public: Handle Unsubscribe ────────────────────────────────────────────

  /**
   * Process an unsubscribe token — call this in your /unsubscribe route.
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async handleUnsubscribe(token) {
    const { decodeUnsubToken } = await import("../utils/helpers.js");
    const email = decodeUnsubToken(token);
    if (!email) {
      logger.warn("[Unsub] Invalid or tampered token.");
      return false;
    }

    const existing = (await store.read("unsubscribes.json")) || [];
    if (!existing.find((r) => r.email === email)) {
      await store.append("unsubscribes.json", {
        email,
        unsubscribedAt: new Date().toISOString(),
      });
    }

    // Mark all their email logs
    await store.update(
      "emailLogs.json",
      (r) => r.email === email,
      ()  => ({ unsubscribed: true })
    );

    logger.info(`🚫 Unsubscribed: ${email}`);
    return true;
  }

  // ─── Public: Handle Webhook Events ────────────────────────────────────────

  /**
   * Process provider webhook events (bounce, spam, open, click, reply).
   * Wire this to POST /webhooks/email in your Express server.
   *
   * @param {Array<Object>} events
   */
  async handleWebhookEvents(events = []) {
    for (const event of events) {
      const { email, type, messageId } = event;
      if (!email || !type) continue;

      switch (type) {
        case "bounce":
        case "hard_bounce":
          await store.update("emailLogs.json", (r) => r.email === email, () => ({ status: "bounced" }));
          logger.warn(`📛 Bounce: ${email}`);
          break;

        case "spam_report":
        case "complaint":
          await store.update("emailLogs.json", (r) => r.email === email, () => ({ status: "spam_reported" }));
          await this.handleUnsubscribe(email); // Auto-unsubscribe on spam complaints
          logger.warn(`🚨 Spam complaint — auto-unsubscribed: ${email}`);
          break;

        case "open":
          await store.update("emailLogs.json", (r) => r.messageId === messageId, () => ({ opened: true, openedAt: new Date().toISOString() }));
          break;

        case "click":
          await store.update("emailLogs.json", (r) => r.messageId === messageId, () => ({ clicked: true, clickedAt: new Date().toISOString() }));
          break;

        case "reply":
          await store.update("emailLogs.json", (r) => r.email === email, () => ({ replied: true, sequenceComplete: true }));
          logger.info(`💬 Reply detected — sequence stopped for: ${email}`);
          break;
      }
    }
  }

  // ─── Public: Analytics ────────────────────────────────────────────────────

  /**
   * Get analytics for a specific campaign.
   * @param {string} campaignId
   */
  async getAnalytics(campaignId) {
    const logs = await store.find("emailLogs.json", (r) => r.campaignId === campaignId);

    const sent         = logs.filter((l) => l.status === "sent").length;
    const failed       = logs.filter((l) => l.status === "failed").length;
    const bounced      = logs.filter((l) => l.status === "bounced").length;
    const opened       = logs.filter((l) => l.opened).length;
    const clicked      = logs.filter((l) => l.clicked).length;
    const replied      = logs.filter((l) => l.replied).length;
    const unsubscribed = logs.filter((l) => l.unsubscribed).length;
    const spamReported = logs.filter((l) => l.status === "spam_reported").length;

    return {
      campaignId,
      total:               logs.length,
      sent,
      failed,
      bounced,
      spamReported,
      unsubscribed,
      openRate:            pct(opened,  sent),
      clickRate:           pct(clicked, sent),
      replyRate:           pct(replied, sent),
      bounceRate:          pct(bounced, sent),
      deliverabilityScore: calcDeliverabilityScore({ sent, bounced, spamReported }),
    };
  }

  // ─── Private: Sequence Resolution ─────────────────────────────────────────

  async _resolveSequenceStep(email, campaignId, sequence) {
    const logs = await store.find(
      "emailLogs.json",
      (r) => r.campaignId === campaignId && r.email === email && r.status === "sent"
    );

    // Check if lead replied or manually opted out of sequence
    const latestLog = logs.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))[0];
    if (latestLog?.sequenceComplete || latestLog?.replied) return null;

    if (!latestLog) return sequence[0];   // Never emailed — start at step 1

    const nextStep = sequence.find((s) => s.step === latestLog.step + 1);
    if (!nextStep) return null;           // Sequence exhausted

    const daysSinceLast =
      (Date.now() - new Date(latestLog.sentAt).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLast < nextStep.dayOffset) return null; // Too soon

    return nextStep;
  }

  // ─── Private: Rate Limiting ────────────────────────────────────────────────

  async _respectHourlyLimit(limit) {
    const elapsed = Date.now() - this._hourWindowStart;

    if (elapsed >= 3_600_000) {
      this._sentThisHour    = 0;
      this._hourWindowStart = Date.now();
      return;
    }

    if (this._sentThisHour >= limit) {
      const waitMs = 3_600_000 - elapsed;
      logger.info(`⏸️  Hourly limit reached. Pausing ${Math.round(waitMs / 60000)} min...`);
      await sleep(waitMs);
      this._sentThisHour    = 0;
      this._hourWindowStart = Date.now();
    }
  }

  // ─── Private: A/B Variant ─────────────────────────────────────────────────

  _applyAbVariant(subject, email, abTest) {
    if (!abTest?.enabled || !abTest?.variants?.length) return subject;
    const hash    = email.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const variant = abTest.variants[hash % abTest.variants.length];
    return subject + (variant.subjectSuffix || "");
  }

  // ─── Private: Finalize Campaign ───────────────────────────────────────────

  async _markCampaignComplete(campaignId, results, reason) {
    const sent   = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    await store.update(
      "campaigns.json",
      (c) => c.campaignId === campaignId,
      ()  => ({
        status:      reason === "completed" ? "completed" : reason,
        completedAt: new Date().toISOString(),
        summary:     { total: results.length, sent, failed },
      })
    );

    return {
      success:    true,
      campaignId,
      total:      results.length,
      sent,
      failed,
      results,
    };
  }
}
// src/workflows/coldMailWorkflow.js
import { ColdMailAgent } from "../agents/coldMailAgent.js";
import { logger } from "../utils/logger.js";

const agent = new ColdMailAgent();

/**
 * Master workflow — call this to run an end-to-end cold mail campaign.
 *
 * @example
 * await runColdMailWorkflow({
 *   campaignName:      "SaaS Founders Outreach — March 2025",
 *   senderName:        "Alex",
 *   productName:       "Growlytics",
 *   valueProposition:  "We help SaaS founders reduce churn by 30% in 60 days",
 *   targetPersona:     "SaaS founders with 10–100 employees",
 *   painPoints:        "High churn, low activation rates, unclear onboarding",
 *   cta:               "Open to a 15-minute call this week?",
 *   tone:              "conversational and direct",
 *   companyAddress:    "123 Startup Lane, San Francisco, CA 94105",
 *   enableFollowUps:   true,
 *   dailyLimit:        40,
 *   abTest: {
 *     enabled: true,
 *     variants: [
 *       { name: "A", subjectSuffix: "" },
 *       { name: "B", subjectSuffix: " (quick question)" },
 *     ],
 *   },
 * });
 */
export async function runColdMailWorkflow(config = {}) {
  logger.info("═".repeat(52));
  logger.info(" Cold Mail Workflow Starting");
  logger.info("═".repeat(52));

  // ── Run Campaign ──────────────────────────────────────────────────────────
  const result = await agent.runCampaign(config);

  if (!result.success) {
    logger.error("Campaign did not complete:", result.message || result.error);
    return result;
  }

  // ── Post-Campaign Analytics ───────────────────────────────────────────────
  if (result.campaignId) {
    const analytics = await agent.getAnalytics(result.campaignId);

    logger.summary({
      "Campaign ID":          analytics.campaignId,
      "Emails Sent":          analytics.sent,
      "Failed":               analytics.failed,
      "Bounced":              analytics.bounced,
      "Spam Reports":         analytics.spamReported,
      "Unsubscribed":         analytics.unsubscribed,
      "Open Rate":            analytics.openRate,
      "Click Rate":           analytics.clickRate,
      "Reply Rate":           analytics.replyRate,
      "Bounce Rate":          analytics.bounceRate,
      "Deliverability Score": `${analytics.deliverabilityScore}/100`,
    });
  }

  logger.info("✅ Workflow complete.\n");
  return result;
}

/**
 * Process an unsubscribe request — mount this in your Express route.
 *
 * @example
 * app.get("/unsubscribe", async (req, res) => {
 *   const success = await handleUnsubscribeRequest(req.query.token);
 *   res.send(success ? "You've been unsubscribed." : "Invalid link.");
 * });
 */
export async function handleUnsubscribeRequest(token) {
  return agent.handleUnsubscribe(token);
}

/**
 * Process provider webhook events — mount this in your Express route.
 *
 * @example
 * app.post("/webhooks/email", async (req, res) => {
 *   await handleEmailWebhook(req.body);
 *   res.sendStatus(200);
 * });
 */
export async function handleEmailWebhook(events) {
  const eventsArray = Array.isArray(events) ? events : [events];
  return agent.handleWebhookEvents(eventsArray);
}

/**
 * Get analytics for a campaign by ID.
 */
export async function getCampaignAnalytics(campaignId) {
  return agent.getAnalytics(campaignId);
}
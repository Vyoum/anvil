// src/services/openAiService.js
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

// ─── Client ───────────────────────────────────────────────────────────────────

let _client = null;

export function getOpenAIClient() {
  if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY is not set in environment variables.");
  if (!_client) _client = new OpenAI({ apiKey: env.openaiApiKey });
  return _client;
}

// ─── Core: Chat Completion ────────────────────────────────────────────────────

/**
 * Send a chat completion request to OpenAI.
 *
 * @param {Object}   options
 * @param {string}   options.systemPrompt
 * @param {string}   options.userPrompt
 * @param {string}   [options.model]         - default: gpt-4o
 * @param {number}   [options.maxTokens]     - default: 1000
 * @param {number}   [options.temperature]   - default: 0.7
 * @param {boolean}  [options.jsonMode]      - force JSON output (default: false)
 * @returns {Promise<string>}
 */
export async function chatCompletion({
  systemPrompt,
  userPrompt,
  model       = "gpt-4o",
  maxTokens   = 1000,
  temperature = 0.7,
  jsonMode    = false,
}) {
  const client = getOpenAIClient();

  const requestOptions = {
    model,
    max_tokens:  maxTokens,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
  };

  if (jsonMode) requestOptions.response_format = { type: "json_object" };

  const response = await client.chat.completions.create(requestOptions);
  return response.choices[0].message.content;
}

// ─── Feature: Generate Cold Email ─────────────────────────────────────────────

/**
 * Generate a personalized cold email using GPT-4o.
 *
 * @param {Object} lead       - Lead data from Google Sheets
 * @param {Object} campaign   - Campaign config from runCampaign()
 * @param {string} templateType - "initial" | "followup_1" | "followup_2" | "breakup"
 * @param {number} stepNumber
 * @returns {Promise<{ subject: string, body: string, previewText: string }>}
 */
export async function generateColdEmail({ lead, campaign, templateType, stepNumber }) {
  const systemPrompt = `You are a world-class copywriter specializing in cold outreach.
Your emails are concise, human, and never sound like marketing copy.
Always respond with valid JSON only — no markdown, no explanation, no backticks.`;

  const userPrompt = buildEmailPrompt({ lead, campaign, templateType, stepNumber });

  try {
    const raw     = await chatCompletion({ systemPrompt, userPrompt, jsonMode: true });
    const content = JSON.parse(raw);

    if (!content.subject || !content.body) {
      throw new Error("Incomplete response from OpenAI — missing subject or body.");
    }

    return {
      subject:     content.subject.trim(),
      body:        content.body.trim(),
      previewText: (content.previewText || content.body.slice(0, 100)).trim(),
    };
  } catch (err) {
    logger.error(`[OpenAIService] generateColdEmail failed: ${err.message}`);
    throw err;
  }
}

// ─── Private: Prompt Builder ──────────────────────────────────────────────────

function buildEmailPrompt({ lead, campaign, templateType, stepNumber }) {
  const sequenceContext = {
    initial:    "This is the very first cold email. Make a strong first impression.",
    followup_1: "This is the first follow-up (sent ~3 days after the initial email). Reference that you reached out before. Be brief.",
    followup_2: "This is the second follow-up (sent ~7 days after the initial). Add one new insight or angle. Keep it short.",
    breakup:    "This is the final breakup email (~14 days in). Make it gracious and leave the door open. No more than 3 sentences.",
  };

  return `
CAMPAIGN DETAILS:
- Sender Name:       ${campaign.senderName}
- Product/Service:   ${campaign.productName}
- Value Proposition: ${campaign.valueProposition}
- Target Persona:    ${campaign.targetPersona}
- Pain Points:       ${campaign.painPoints  || "N/A"}
- Call to Action:    ${campaign.cta         || "Open to a quick call?"}
- Tone:              ${campaign.tone        || "conversational and direct"}

LEAD INFO:
- First Name:  ${lead.firstName || "there"}
- Company:     ${lead.company   || "your company"}
- Industry:    ${lead.industry  || "your industry"}
- Context:     ${lead.context   || "N/A"}
- Class Link:  ${lead.classLink || lead.link || "N/A"}

SEQUENCE STEP: ${stepNumber} (${templateType})
INSTRUCTIONS: ${sequenceContext[templateType] || sequenceContext.initial}

WRITING RULES:
1. Subject line must be under 5 words — no clickbait.
2. First sentence must reference something specific about the lead (company, industry, or context).
3. Total body length must be under 150 words.
4. If a Class Link is provided, embed it as an HTML anchor with text "Watch Now".
5. Never use corporate jargon, buzzwords, or em-dashes.
6. CTA must be a single low-friction question.
7. Sign off with the sender's first name only.

OUTPUT FORMAT (strict JSON, no markdown):
{
  "subject":     "...",
  "body":        "... (HTML allowed for links/buttons) ...",
  "previewText": "..."
}
`.trim();
}

// ─── Feature: Classify Reply Intent ───────────────────────────────────────────

/**
 * Classify an inbound reply to determine intent.
 * Useful if you build an auto-reply handler later.
 *
 * @param {string} replyText - Raw reply email body
 * @returns {Promise<"interested" | "not_interested" | "out_of_office" | "question" | "other">}
 */
export async function classifyReplyIntent(replyText) {
  const systemPrompt = `You are an email intent classifier. 
Respond with a single JSON object: { "intent": "<label>" }
Valid labels: interested, not_interested, out_of_office, question, other`;

  const userPrompt = `Classify the intent of this reply:\n\n${replyText.slice(0, 1000)}`;

  try {
    const raw    = await chatCompletion({ systemPrompt, userPrompt, temperature: 0, jsonMode: true });
    const parsed = JSON.parse(raw);
    return parsed.intent || "other";
  } catch {
    return "other";
  }
}
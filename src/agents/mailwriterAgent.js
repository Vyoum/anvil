// src/agents/mailWriterAgent.js
import OpenAI from "openai";
import { env } from "../config/env.js";

export class MailWriterAgent {
  constructor() {
    this.openai = new OpenAI({ apiKey: env.openaiApiKey });
  }

  async writeColdEmail({ lead, campaign, templateType, stepNumber }) {
    // Basic implementation: if OpenAI API key is missing, return a generic template
    if (!env.openaiApiKey) {
      return {
        subject: `Hello from ${campaign.senderName}`,
        body: `Hi ${lead.firstName},\n\nThis is a cold email about ${campaign.productName}.`,
        previewText: "A quick introduction"
      };
    }

    // Use OpenAI to write a hyper-personalized email
    const prompt = `
      You are an expert cold outreach specialist. Write a highly personalized, conversational, and non-salesy cold email.
      
      CONTEXT:
      - Sender Name: ${campaign.senderName}
      - Product/Service: ${campaign.productName}
      - Value Prop: ${campaign.valueProposition}
      - Target Persona: ${campaign.targetPersona}
      - Tone: ${campaign.tone || "professional yet friendly"}
      - Step in Sequence: ${stepNumber} (${templateType})

      LEAD INFO:
      - Name: ${lead.firstName || "there"}
      - Company: ${lead.company || "your company"}
      - Industry: ${lead.industry || "your industry"}
      - Recent News/Context: ${lead.context || "N/A"}

      REQUIREMENTS:
      1. Subject line must be punchy and under 5 words.
      2. The first sentence MUST be a personalized observation about their company or industry (if context provided).
      3. Focus on a specific pain point and how we solve it.
      4. Keep the total length under 150 words.
      5. Include a clear, low-friction Call to Action (CTA).
      6. Use a "human" style — no corporate jargon or overly formal language.

      OUTPUT FORMAT (JSON):
      {
        "subject": "...",
        "body": "...",
        "previewText": "..."
      }
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "system", content: "You are a world-class copywriter specializing in cold outreach." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });

      const content = JSON.parse(response.choices[0].message.content);
      return {
        subject: content.subject,
        body: content.body,
        previewText: content.previewText || content.body.slice(0, 100) + "..."
      };
    } catch (err) {
      console.error("[MailWriter] AI Generation failed, falling back to template:", err);
      return {
        subject: `Question for ${lead.firstName || lead.company}`,
        body: `Hi ${lead.firstName || "there"},\n\nI was researching ${lead.company || "your company"} and had a few ideas on how ${campaign.productName} could help with your ${campaign.targetPersona} goals.\n\nWould you be open to a brief chat?\n\nBest,\n${campaign.senderName}`,
        previewText: "Quick question regarding your goals"
      };
    }
  }
}

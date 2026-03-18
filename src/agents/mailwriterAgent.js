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

    // Use OpenAI to write a personalized email
    const prompt = `Write a cold email to ${lead.firstName} from ${campaign.senderName} about ${campaign.productName}.\nTemplate: ${templateType}, Step: ${stepNumber}`;
    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const body = response.choices[0].message.content;
    return {
      subject: `Custom Subject for ${lead.firstName}`,
      body,
      previewText: body.slice(0, 50) + "..."
    };
  }
}

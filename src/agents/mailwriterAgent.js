// In mailWriterAgent.js — replace the throw with a smart fallback

const result = await completeJson({ systemPrompt, userPrompt, ... });

if (!result.subject || !result.body) {
  // YOUR fallback logic — much better than throwing
  logger.warn(`[MailWriter] Incomplete AI response for ${lead.email} — using fallback template`);
  return this._fallbackTemplate(lead, campaign, stepDef.templateType);
}

// Add this private method
_fallbackTemplate(lead, campaign, templateType) {
  const name    = lead.firstName || lead.company || "there";
  const company = lead.company   || "your company";

  const bodies = {
    initial:    `Hi ${name},\n\nI was looking at ${company} and had a few ideas on how ${campaign.productName} could help.\n\nWould you be open to a quick chat?\n\n${campaign.senderName}`,
    followup_1: `Hi ${name},\n\nJust following up on my last email — wanted to make sure it didn't get buried.\n\n${campaign.senderName}`,
    followup_2: `Hi ${name},\n\nOne last thought — ${campaign.valueProposition}.\n\nWorth a conversation?\n\n${campaign.senderName}`,
    breakup:    `Hi ${name},\n\nI won't keep following up after this. If timing ever changes, feel free to reach out.\n\n${campaign.senderName}`,
  };

  return {
    subject:     `Quick question, ${name}`,
    body:        bodies[templateType] || bodies.initial,
    previewText: `A quick note from ${campaign.senderName}`,
  };
}
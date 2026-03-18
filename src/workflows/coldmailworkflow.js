// src/workflows/coldMailWorkflow.js
import { ColdMailAgent } from "../agents/coldmailAgent.js";
import { logger } from "../utils/logger.js";

async function main() {
  const agent = new ColdMailAgent();
  
  const config = {
    campaignName: "Test Campaign",
    senderName: "AI Outreach",
    productName: "Anvil AI",
    valueProposition: "Automating your cold emails with AI",
    targetPersona: "Founders & Sales Teams",
    companyAddress: "123 AI St, San Francisco, CA",
    dailyLimit: 5,
    hourlyLimit: 2,
  };

  try {
    const summary = await agent.runCampaign(config);
    logger.info("Campaign completed successfully!");
    console.table(summary);
  } catch (err) {
    logger.error(`Campaign failed: ${err.message}`);
  }
}

main().catch(console.error);

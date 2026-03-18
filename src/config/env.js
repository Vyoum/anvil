// src/config/env.js
import dotenv from "dotenv";
dotenv.config();

export const env = {
  dailyLimit:  parseInt(process.env.DAILY_LIMIT || "50", 10),
  hourlyLimit: parseInt(process.env.HOURLY_LIMIT || "10", 10),
  openaiApiKey: process.env.OPENAI_API_KEY,
  googleSheetId: process.env.GOOGLE_SHEET_ID,
  smtpHost:     process.env.SMTP_HOST,
  smtpPort:     parseInt(process.env.SMTP_PORT || "587", 10),
  smtpUser:     process.env.SMTP_USER,
  smtpPass:     process.env.SMTP_PASS,
};

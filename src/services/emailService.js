// src/services/emailService.js
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass,
  },
});

export async function verifyConnection() {
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    console.error("SMTP Connection Error:", err);
    return false;
  }
}

export async function sendMail({ to, subject, html, from }) {
  const info = await transporter.sendMail({
    from: from || env.smtpUser,
    to,
    subject,
    html,
  });
  return {
    messageId: info.messageId,
    emailId: info.messageId, // Using messageId as emailId for simplicity
  };
}

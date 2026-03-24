// src/services/emailService.js
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Create a transporter for a specific account.
 */
export function createTransporter(account = {}) {
  return nodemailer.createTransport({
    host: account.smtpHost || env.smtpHost,
    port: account.smtpPort || env.smtpPort,
    secure: (account.smtpPort || env.smtpPort) === 465,
    auth: {
      user: account.smtpUser || env.smtpUser,
      pass: account.smtpPass || env.smtpPass,
    },
  });
}

const defaultTransporter = createTransporter();

export async function verifyConnection(account = null) {
  const transporter = account ? createTransporter(account) : defaultTransporter;
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    console.error("SMTP Connection Error:", err);
    return false;
  }
}

export async function sendEmail({ to, subject, html, from, account = null }) {
  const transporter = account ? createTransporter(account) : defaultTransporter;
  const info = await transporter.sendMail({
    from: from || account?.smtpUser || env.smtpUser,
    to,
    subject,
    html,
  });
  return {
    messageId: info.messageId,
    emailId: info.messageId,
  };
}

// src/agents/mailSenderAgent.js
import { sendEmail } from "../services/emailService.js";
import {
  generateUnsubToken,
  buildTrackingPixelUrl,
  wrapLinksForTracking,
  uuid,
  parseSpintax,
} from "../utils/helpers.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const MAX_RETRIES    = 2;
const RETRY_DELAY_MS = 5_000;

export class MailSenderAgent {
  /**
   * Send a fully-assembled cold email with tracking + legal footer injected.
   *
   * @param {Object} options
   * @param {string}  options.to
   * @param {string}  options.subject
   * @param {string}  options.html         - Body HTML (from MailWriterAgent)
   * @param {string}  [options.previewText]
   * @param {string}  [options.replyTo]
   * @param {string}  [options.fromName]
   * @param {string}  [options.companyAddress]
   * @returns {Promise<{ messageId: string, emailId: string }>}
   */
  async sendMail({ to, subject, html, previewText = "", replyTo, fromName, companyAddress }) {
    const emailId    = uuid();
    const unsubToken = generateUnsubToken(to);

    // Build the final HTML: preview text + tracked body + footer
    const finalHtml = this._buildFinalHtml(html, emailId, unsubToken, previewText, companyAddress);

    const result = await this._sendWithRetry(
      { to, subject, html: finalHtml, replyTo, fromName },
      emailId
    );

    return { ...result, emailId };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  async _sendWithRetry(mailOptions, emailId, attempt = 1) {
    try {
      return await sendEmail(mailOptions);
    } catch (err) {
      if (attempt <= MAX_RETRIES) {
        logger.warn(`[MailSender] Attempt ${attempt} failed for ${mailOptions.to}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return this._sendWithRetry(mailOptions, emailId, attempt + 1);
      }
      throw err;
    }
  }

  _buildFinalHtml(bodyHtml, emailId, unsubToken, previewText, companyAddress) {
    const spintaxBody      = parseSpintax(bodyHtml);
    const trackedBody      = wrapLinksForTracking(spintaxBody, emailId);
    const trackingPixelUrl = buildTrackingPixelUrl(emailId);
    const unsubscribeUrl   = `${env.appUrl}/unsubscribe?token=${unsubToken}`;

    // Invisible preview text (inbox snippet hack)
    const previewSnippet = previewText
      ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#ffffff;">${previewText}</div>`
      : "";

    // CAN-SPAM / GDPR compliant footer
    const footer = `
      <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e8e8e8;
                  font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;line-height:1.6;">
        <p style="margin:0 0 6px;">
          You received this email because your contact was included in an outreach list.<br/>
          <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="${unsubscribeUrl}" style="color:#9ca3af;">Manage preferences</a>
        </p>
        ${companyAddress ? `<p style="margin:0;">${companyAddress}</p>` : ""}
      </div>
      <!-- Open tracking -->
      <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
    `;

    return `${previewSnippet}${trackedBody}${footer}`;
  }
}
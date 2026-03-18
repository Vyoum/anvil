// src/agents/mailSenderAgent.js
import { sendMail } from "../services/emailService.js";

export class MailSenderAgent {
  async sendMail({ to, subject, html, previewText, companyAddress }) {
    // Send using email service
    const result = await sendMail({
      to,
      subject,
      html: `
        <div>
          <p style="color: #666; font-size: 0.9em;">${previewText}</p>
          ${html}
          <hr>
          <footer style="font-size: 0.8em; color: #999;">
            ${companyAddress}<br>
            <a href="{{unsubscribe_url}}">Unsubscribe</a>
          </footer>
        </div>
      `,
    });
    return result;
  }
}

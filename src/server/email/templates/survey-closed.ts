import { resend, FROM_EMAIL } from "../resend";

interface SendSurveyClosedEmailParams {
  to: string;
  surveyTitle: string;
  resultsUrl: string;
}

/**
 * Send a notification email when a survey closes.
 * Subject: "Results are in: {title}"
 */
export async function sendSurveyClosedEmail({
  to,
  surveyTitle,
  resultsUrl,
}: SendSurveyClosedEmailParams) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Results are in: ${surveyTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #111827; font-size: 24px; margin-bottom: 16px;">
          Survey results are ready
        </h1>
        <h2 style="color: #374151; font-size: 20px; margin-bottom: 8px;">
          ${escapeHtml(surveyTitle)}
        </h2>
        <p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
          The survey has been closed and the results are now available for viewing.
        </p>
        <a
          href="${resultsUrl}"
          style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;"
        >
          View Results
        </a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
          This notification was sent via Attestly because you participated in this survey.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error(`Failed to send survey closed email to ${to}:`, error);
    throw error;
  }
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

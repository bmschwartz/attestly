import { resend, FROM_EMAIL } from "../resend";

interface SendInvitationEmailParams {
  to: string;
  surveyTitle: string;
  surveyDescription: string;
  surveyUrl: string;
}

/**
 * Send an invitation email when a creator adds an EMAIL invite.
 * Subject: "You're invited: {title}"
 */
export async function sendInvitationEmail({
  to,
  surveyTitle,
  surveyDescription,
  surveyUrl,
}: SendInvitationEmailParams) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You're invited: ${surveyTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #111827; font-size: 24px; margin-bottom: 16px;">
          You've been invited to a survey
        </h1>
        <h2 style="color: #374151; font-size: 20px; margin-bottom: 8px;">
          ${escapeHtml(surveyTitle)}
        </h2>
        ${surveyDescription ? `<p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">${escapeHtml(surveyDescription)}</p>` : ""}
        <a
          href="${surveyUrl}"
          style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;"
        >
          Take the Survey
        </a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
          This invitation was sent via Attestly. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error(`Failed to send invitation email to ${to}:`, error);
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

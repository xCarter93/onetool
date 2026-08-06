// Org-branded email shell, shared by manual client emails (resend.ts) and the
// automation send_email action. Pure string builders — no ctx, no env vars.

import { sanitizeHtml, EMAIL_BODY_STYLES } from "./sanitizeHtml";

// Canonical fallback when an org has no receiving address configured (rare
// post-migration). Never throws — a missing address must not block sends.
export const FALLBACK_FROM_EMAIL = "support@onetool.biz";

export function resolveFromEmail(organization: {
	receivingAddress?: string;
}): string {
	const addr = organization.receivingAddress?.trim();
	return addr && addr.length > 0 ? addr : FALLBACK_FROM_EMAIL;
}

// OneTool brand mark, served from the marketing site's public assets. Used for
// the "Powered by OneTool" footer lockup on org-branded client emails.
export const ONETOOL_MARK_URL = "https://onetool.biz/OneTool-mark.png";

// Two-letter monogram shown when an org hasn't uploaded a logo.
export function getOrgInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Build email HTML with organization branding. `clientName` is optional:
 * automation sends to explicit addresses may have no client in scope, in which
 * case the greeting line is omitted. When the sender IS the organization
 * (automation sends), the duplicate org sub-line under the signature is
 * dropped.
 */
export function buildEmailHtml(options: {
	logoUrl?: string;
	organizationName: string;
	organizationEmail?: string;
	organizationPhone?: string;
	organizationAddress?: string;
	clientName?: string;
	messageBody: string;
	/**
	 * Rich-text (composer) body. When present it REPLACES the plain-text ->
	 * `<p>` pipeline; `messageBody` is still required as the text/plain
	 * alternative. Re-sanitized here as defense in depth even though callers
	 * (resend.ts) sanitize before storing.
	 */
	messageHtml?: string;
	senderName: string; // Name of the person (or org) sending the email
}): string {
	const {
		logoUrl,
		organizationName,
		organizationEmail,
		organizationPhone,
		organizationAddress,
		clientName,
		messageBody,
		senderName,
	} = options;

	// Current year for the footer copyright line.
	const year = new Date().getFullYear();

	// HTML escape helper to prevent XSS
	const escapeHtml = (text: string): string => {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;")
			.replace(/\//g, "&#x2F;");
	};

	// Escape all user-provided content
	const escapedClientName = clientName ? escapeHtml(clientName) : undefined;
	const escapedSenderName = escapeHtml(senderName);
	const escapedOrganizationName = escapeHtml(organizationName);
	const escapedOrganizationEmail = organizationEmail
		? escapeHtml(organizationEmail)
		: undefined;
	const escapedOrganizationPhone = organizationPhone
		? escapeHtml(organizationPhone)
		: undefined;
	const escapedOrganizationAddress = organizationAddress
		? escapeHtml(organizationAddress)
		: undefined;
	const escapedInitials = escapeHtml(getOrgInitials(organizationName));
	const escapedLogoUrl = logoUrl ? escapeHtml(logoUrl) : undefined;

	// Rich-text body when provided; otherwise convert the plain-text body to
	// HTML (preserve line breaks) with XSS protection.
	const sanitizedRichBody = options.messageHtml
		? sanitizeHtml(options.messageHtml, { styles: EMAIL_BODY_STYLES })
		: "";
	const bodyHtml =
		sanitizedRichBody.length > 0
			? sanitizedRichBody
			: messageBody
					.split("\n")
					.map((line) => {
						const escapedLine = escapeHtml(line);
						return `<p style="margin: 8px 0;">${escapedLine || "&nbsp;"}</p>`;
					})
					.join("");

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapedOrganizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; color: #0f172a;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
		<tr>
			<td align="center">
				<!-- Main card -->
				<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e6eaf0; border-radius: 14px; overflow: hidden;">
					<!-- Org identity lockup -->
					<tr>
						<td style="padding: 30px 40px 22px 40px; border-bottom: 1px solid #e2e8f0;">
							<table role="presentation" cellpadding="0" cellspacing="0">
								<tr>
									<td style="vertical-align: middle;">
										${
											logoUrl
												? `<img src="${escapedLogoUrl}" alt="${escapedOrganizationName}" style="max-height: 40px; max-width: 200px; height: auto; display: block;" />`
												: `<div style="width: 40px; height: 40px; border-radius: 10px; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 700; text-align: center; line-height: 40px;">${escapedInitials}</div>`
										}
									</td>
									${
										logoUrl
											? ""
											: `<td style="vertical-align: middle; padding-left: 12px;"><span style="font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em;">${escapedOrganizationName}</span></td>`
									}
								</tr>
							</table>
						</td>
					</tr>

					<!-- Letter body -->
					<tr>
						<td style="padding: 26px 40px 30px 40px;">
							${escapedClientName ? `<p style="margin: 0 0 18px 0; font-size: 16px; line-height: 1.6; color: #0f172a;">Hi ${escapedClientName},</p>` : ""}
							<div style="font-size: 15px; line-height: 1.7; color: #334155;">
								${bodyHtml}
							</div>
							<p style="margin: 28px 0 4px 0; font-size: 15px; line-height: 1.6; color: #334155;">Best regards,</p>
							<p style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;">${escapedSenderName}</p>
							${senderName === organizationName ? "" : `<p style="margin: 2px 0 0 0; font-size: 13px; color: #64748b;">${escapedOrganizationName}</p>`}
						</td>
					</tr>

					<!-- Footer: org contact + OneTool branding -->
					<tr>
						<td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 40px;">
							<p style="margin: 0 0 5px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${escapedOrganizationName}</p>
							<p style="margin: 0; font-size: 13px; line-height: 1.7; color: #64748b;">
								${escapedOrganizationEmail ? `<a href="mailto:${escapedOrganizationEmail}" style="color: #2563eb; text-decoration: none;">${escapedOrganizationEmail}</a>` : ""}${escapedOrganizationEmail && escapedOrganizationPhone ? " &middot; " : ""}${escapedOrganizationPhone ? escapedOrganizationPhone : ""}${(escapedOrganizationEmail || escapedOrganizationPhone) && escapedOrganizationAddress ? "<br />" : ""}${escapedOrganizationAddress ? escapedOrganizationAddress : ""}
							</p>
							<div style="height: 1px; line-height: 1px; font-size: 0; background-color: #e9edf3; margin: 16px 0;">&nbsp;</div>
							<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
								<tr>
									<td style="vertical-align: middle;">
										<img src="${ONETOOL_MARK_URL}" alt="OneTool" width="16" height="16" style="vertical-align: middle; display: inline-block;" />
										<span style="font-size: 12px; color: #475569; font-weight: 600; vertical-align: middle; margin-left: 6px;">Powered by OneTool</span>
									</td>
									<td style="vertical-align: middle; text-align: right; font-size: 11px; color: #94a3b8;">&copy; ${year} OneTool</td>
								</tr>
							</table>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();
}

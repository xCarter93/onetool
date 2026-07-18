import * as React from "react";
import {
	Html,
	Head,
	Body,
	Container,
	Section,
	Row,
	Column,
	Text,
	Heading,
	Button,
	Img,
	Preview,
} from "@react-email/components";

interface InvoiceReadyEmailProps {
	businessName: string;
	businessLogoUrl?: string;
	businessEmail?: string;
	businessPhone?: string;
	invoiceNumber: string;
	/** Pre-formatted currency string (e.g. "$1,204.50") — never format money here. */
	amountFormatted: string;
	dueDateFormatted?: string;
	portalUrl: string;
	clientName?: string;
}

// Same brand mark used by resend.ts's buildEmailHtml() "Powered by OneTool" footer.
const ONETOOL_MARK_URL = "https://onetool.biz/OneTool-mark.png";

// Two-letter monogram fallback when the org hasn't uploaded a logo — mirrors
// resend.ts's getOrgInitials so the two email surfaces render identically.
function getOrgInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

export function InvoiceReadyEmail({
	businessName,
	businessLogoUrl,
	businessEmail,
	businessPhone,
	invoiceNumber,
	amountFormatted,
	dueDateFormatted,
	portalUrl,
	clientName,
}: InvoiceReadyEmailProps) {
	const greetingName = clientName ? clientName : "there";
	const initials = getOrgInitials(businessName);
	const hasContactLine = Boolean(businessEmail || businessPhone);

	return (
		<Html>
			<Head />
			<Preview>
				Invoice {invoiceNumber} from {businessName}
			</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					{/* Org identity lockup */}
					<Section style={styles.header}>
						{businessLogoUrl ? (
							<Img
								src={businessLogoUrl}
								alt={businessName}
								style={styles.logo}
							/>
						) : (
							<Row>
								<Column style={{ width: "40px" }}>
									<div style={styles.monogram}>{initials}</div>
								</Column>
								<Column>
									<Text style={styles.businessName}>{businessName}</Text>
								</Column>
							</Row>
						)}
					</Section>

					<Section style={styles.content}>
						<Heading style={styles.heading}>Your invoice is ready</Heading>

						<Text style={styles.paragraph}>Hi {greetingName},</Text>
						<Text style={styles.paragraph}>
							{businessName} has sent you an invoice. You can view the details
							and pay securely from your client portal.
						</Text>

						<Section style={styles.summaryBox}>
							<Row>
								<Column>
									<Text style={styles.summaryLabel}>Invoice</Text>
									<Text style={styles.summaryValue}>{invoiceNumber}</Text>
								</Column>
								<Column>
									<Text style={styles.summaryLabel}>Amount due</Text>
									<Text style={styles.summaryValue}>{amountFormatted}</Text>
								</Column>
								{dueDateFormatted ? (
									<Column>
										<Text style={styles.summaryLabel}>Due date</Text>
										<Text style={styles.summaryValue}>
											{dueDateFormatted}
										</Text>
									</Column>
								) : null}
							</Row>
						</Section>

						<Section style={{ textAlign: "center" as const }}>
							<Button href={portalUrl} style={styles.button}>
								View &amp; Pay Invoice
							</Button>
						</Section>

						<Text style={styles.note}>
							For security, you&apos;ll be asked to sign in with your email
							address before viewing the invoice.
						</Text>
					</Section>

					{/* Footer: business contact + OneTool branding */}
					<Section style={styles.footer}>
						{businessName ? (
							<Text style={styles.footerBusinessName}>{businessName}</Text>
						) : null}
						{hasContactLine ? (
							<Text style={styles.footerContact}>
								{businessEmail}
								{businessEmail && businessPhone ? " · " : ""}
								{businessPhone}
							</Text>
						) : null}
						<Row>
							<Column>
								<Img
									src={ONETOOL_MARK_URL}
									alt="OneTool"
									width="16"
									height="16"
									style={styles.mark}
								/>
							</Column>
							<Column>
								<Text style={styles.poweredBy}>Powered by OneTool</Text>
							</Column>
						</Row>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const styles = {
	body: {
		fontFamily:
			"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
		lineHeight: "1.6",
		color: "#111827",
		margin: "0",
		padding: "0",
		backgroundColor: "#f1f5f9",
	},
	container: {
		maxWidth: "600px",
		margin: "20px auto",
		backgroundColor: "#ffffff",
		border: "1px solid #e6eaf0",
		borderRadius: "14px",
		overflow: "hidden",
	},
	header: {
		padding: "30px 40px 22px 40px",
		borderBottom: "1px solid #e2e8f0",
	},
	logo: {
		maxHeight: "40px",
		maxWidth: "200px",
		height: "auto",
	},
	monogram: {
		width: "40px",
		height: "40px",
		borderRadius: "10px",
		backgroundColor: "#2563eb",
		color: "#ffffff",
		fontSize: "15px",
		fontWeight: "700",
		textAlign: "center" as const,
		lineHeight: "40px",
	},
	businessName: {
		margin: "0",
		fontSize: "18px",
		fontWeight: "700",
		color: "#0f172a",
		letterSpacing: "-0.01em",
	},
	content: {
		padding: "26px 40px 30px 40px",
	},
	heading: {
		margin: "0 0 16px 0",
		fontSize: "22px",
		fontWeight: "600",
		color: "#111827",
	},
	paragraph: {
		margin: "0 0 16px 0",
		fontSize: "14px",
		fontWeight: "400",
		color: "#374151",
		lineHeight: "1.6",
	},
	summaryBox: {
		backgroundColor: "#f9fafb",
		border: "1px solid #e5e7eb",
		borderRadius: "8px",
		padding: "16px 20px",
		margin: "8px 0 24px 0",
	},
	summaryLabel: {
		margin: "0",
		fontSize: "11px",
		fontWeight: "600",
		color: "#6b7280",
		textTransform: "uppercase" as const,
		letterSpacing: "0.03em",
	},
	summaryValue: {
		margin: "2px 0 0 0",
		fontSize: "15px",
		fontWeight: "700",
		color: "#111827",
	},
	button: {
		display: "inline-block",
		backgroundColor: "#2563eb",
		color: "#ffffff",
		fontSize: "15px",
		fontWeight: "600",
		textDecoration: "none",
		padding: "12px 28px",
		borderRadius: "8px",
		margin: "8px 0 20px 0",
	},
	note: {
		margin: "0",
		fontSize: "13px",
		color: "#6b7280",
		lineHeight: "1.6",
		textAlign: "center" as const,
	},
	footer: {
		backgroundColor: "#f8fafc",
		borderTop: "1px solid #e2e8f0",
		padding: "24px 40px",
	},
	footerBusinessName: {
		margin: "0 0 5px 0",
		fontSize: "13px",
		fontWeight: "700",
		color: "#0f172a",
	},
	footerContact: {
		margin: "0 0 16px 0",
		fontSize: "13px",
		color: "#64748b",
	},
	mark: {
		display: "inline-block",
		verticalAlign: "middle" as const,
	},
	poweredBy: {
		margin: "0",
		fontSize: "12px",
		fontWeight: "600",
		color: "#475569",
	},
};

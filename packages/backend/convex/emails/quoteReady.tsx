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

interface QuoteReadyEmailProps {
	businessName: string;
	businessLogoUrl?: string;
	businessEmail?: string;
	businessPhone?: string;
	/** Human-readable quote title, when the quote has one. */
	quoteTitle?: string;
	/** Display label for the quote number (e.g. "Q-000042") — quotes may not have one. */
	quoteNumberLabel?: string;
	/** Pre-formatted currency string (e.g. "$1,204.50") — never format money here. */
	amountFormatted: string;
	validUntilFormatted?: string;
	portalUrl: string;
	clientName?: string;
}

import { ONETOOL_MARK_URL, getOrgInitials } from "../email/branding";

export function QuoteReadyEmail({
	businessName,
	businessLogoUrl,
	businessEmail,
	businessPhone,
	quoteTitle,
	quoteNumberLabel,
	amountFormatted,
	validUntilFormatted,
	portalUrl,
	clientName,
}: QuoteReadyEmailProps) {
	const greetingName = clientName ? clientName : "there";
	const initials = getOrgInitials(businessName);
	const hasContactLine = Boolean(businessEmail || businessPhone);
	const previewText = quoteNumberLabel
		? `Quote ${quoteNumberLabel} from ${businessName}`
		: `New quote from ${businessName}`;

	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
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
						<Heading style={styles.heading}>Your quote is ready</Heading>

						<Text style={styles.paragraph}>Hi {greetingName},</Text>
						<Text style={styles.paragraph}>
							{businessName} has prepared a quote for you. You can review the
							details and approve it from your client portal.
						</Text>

						{quoteTitle ? (
							<Text style={styles.quoteTitle}>{quoteTitle}</Text>
						) : null}

						<Section style={styles.summaryBox}>
							<Row>
								{quoteNumberLabel ? (
									<Column>
										<Text style={styles.summaryLabel}>Quote</Text>
										<Text style={styles.summaryValue}>{quoteNumberLabel}</Text>
									</Column>
								) : null}
								<Column>
									<Text style={styles.summaryLabel}>Total</Text>
									<Text style={styles.summaryValue}>{amountFormatted}</Text>
								</Column>
								{validUntilFormatted ? (
									<Column>
										<Text style={styles.summaryLabel}>Valid until</Text>
										<Text style={styles.summaryValue}>
											{validUntilFormatted}
										</Text>
									</Column>
								) : null}
							</Row>
						</Section>

						<Section style={{ textAlign: "center" as const }}>
							<Button href={portalUrl} style={styles.button}>
								Review quote
							</Button>
						</Section>

						<Text style={styles.note}>
							For security, you&apos;ll be asked to sign in with your email
							address before viewing the quote.
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
	quoteTitle: {
		margin: "0 0 8px 0",
		fontSize: "15px",
		fontWeight: "600",
		color: "#111827",
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

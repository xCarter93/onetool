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
	Link,
	Heading,
	Button,
	Img,
	Preview,
} from "@react-email/components";

interface ScheduleDemoRequestEmailProps {
	name: string;
	email: string;
	company?: string;
	phone?: string;
	message?: string;
	timestamp: string;
}

// OneTool wordmark, served from the marketing site's public assets.
const ONETOOL_WORDMARK_URL = "https://onetool.biz/OneTool-wordmark.png";

export const ScheduleDemoRequestEmail = ({
	name,
	email,
	company,
	phone,
	message,
	timestamp,
}: ScheduleDemoRequestEmailProps) => {
	const firstName = name.trim().split(/\s+/)[0] || name;
	const replyHref = `mailto:${email}?subject=${encodeURIComponent(
		"Re: Your OneTool demo request"
	)}`;

	return (
		<Html lang="en">
			<Head />
			<Preview>
				New demo request from {name}
				{company ? ` · ${company}` : ""}
			</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					{/* Header — leads with the prospect */}
					<Section style={styles.header}>
						<Text style={styles.eyebrow}>New demo request</Text>
						<Heading as="h1" style={styles.name}>
							{name}
						</Heading>
						{company ? <Text style={styles.company}>{company}</Text> : null}
					</Section>

					{/* Contact details */}
					<Section style={styles.content}>
						<Row>
							<Column style={styles.cellFirst}>
								<Text style={styles.label}>Email</Text>
								<Link href={`mailto:${email}`} style={styles.value}>
									{email}
								</Link>
							</Column>
							<Column style={styles.cell}>
								{phone ? (
									<>
										<Text style={styles.label}>Phone</Text>
										<Link href={`tel:${phone}`} style={styles.value}>
											{phone}
										</Link>
									</>
								) : null}
							</Column>
						</Row>

						{message ? (
							<Section style={styles.messageWrap}>
								<Text style={styles.label}>Message</Text>
								<Section style={styles.messageBox}>
									<Text style={styles.messageText}>{message}</Text>
								</Section>
							</Section>
						) : null}

						{/* Primary action */}
						<Section style={styles.ctaWrap}>
							<Button href={replyHref} style={styles.button}>
								Reply to {firstName} →
							</Button>
							<Text style={styles.slaHint}>Aim to respond within 24 hours</Text>
						</Section>
					</Section>

					{/* Footer */}
					<Section style={styles.footer}>
						<Row>
							<Column style={styles.footerLeft}>
								<Text style={styles.footerText}>
									Submitted {timestamp} · via the demo form
								</Text>
							</Column>
							<Column style={styles.footerRight}>
								<Img
									src={ONETOOL_WORDMARK_URL}
									alt="OneTool"
									width={77}
									height={20}
									style={styles.wordmark}
								/>
							</Column>
						</Row>
					</Section>
				</Container>
			</Body>
		</Html>
	);
};

// Styles — OneTool transactional-email palette (navy ink, single blue accent).
const styles: Record<string, React.CSSProperties> = {
	body: {
		backgroundColor: "#f1f5f9",
		fontFamily:
			"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
		margin: "0",
		padding: "24px 12px",
	},
	container: {
		maxWidth: "600px",
		margin: "0 auto",
		backgroundColor: "#ffffff",
		border: "1px solid #e6eaf0",
		borderRadius: "14px",
		overflow: "hidden",
	},
	header: {
		padding: "28px 32px 22px 32px",
		borderBottom: "1px solid #e2e8f0",
	},
	eyebrow: {
		margin: "0 0 10px 0",
		fontSize: "11px",
		fontWeight: "700",
		letterSpacing: "0.1em",
		textTransform: "uppercase",
		color: "#2563eb",
	},
	name: {
		margin: "0",
		fontSize: "22px",
		fontWeight: "700",
		letterSpacing: "-0.02em",
		color: "#0f172a",
	},
	company: {
		margin: "4px 0 0 0",
		fontSize: "15px",
		color: "#64748b",
	},
	content: {
		padding: "22px 32px 8px 32px",
	},
	cellFirst: {
		width: "50%",
		verticalAlign: "top",
		paddingRight: "12px",
		paddingBottom: "18px",
	},
	cell: {
		width: "50%",
		verticalAlign: "top",
		paddingBottom: "18px",
	},
	label: {
		margin: "0 0 4px 0",
		fontSize: "11px",
		fontWeight: "600",
		letterSpacing: "0.06em",
		textTransform: "uppercase",
		color: "#94a3b8",
	},
	value: {
		fontSize: "14px",
		color: "#2563eb",
		textDecoration: "none",
		fontWeight: "500",
	},
	messageWrap: {
		paddingTop: "2px",
	},
	messageBox: {
		backgroundColor: "#f8fafc",
		borderLeft: "3px solid #2563eb",
		borderRadius: "6px",
		padding: "14px 16px",
		marginTop: "0",
	},
	messageText: {
		margin: "0",
		color: "#334155",
		fontSize: "14px",
		lineHeight: "1.65",
		whiteSpace: "pre-wrap",
	},
	ctaWrap: {
		paddingTop: "20px",
		paddingBottom: "8px",
	},
	button: {
		backgroundColor: "#2563eb",
		color: "#ffffff",
		fontSize: "14px",
		fontWeight: "600",
		textDecoration: "none",
		padding: "11px 20px",
		borderRadius: "8px",
		boxSizing: "border-box",
	},
	slaHint: {
		margin: "10px 0 0 0",
		fontSize: "13px",
		color: "#94a3b8",
	},
	footer: {
		backgroundColor: "#f8fafc",
		borderTop: "1px solid #e2e8f0",
		padding: "16px 32px",
	},
	footerLeft: {
		verticalAlign: "middle",
	},
	footerRight: {
		verticalAlign: "middle",
		textAlign: "right",
	},
	footerText: {
		margin: "0",
		fontSize: "12px",
		color: "#64748b",
	},
	wordmark: {
		display: "inline-block",
	},
};

export default ScheduleDemoRequestEmail;

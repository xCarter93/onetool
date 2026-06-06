import * as React from "react";
import {
	Html,
	Head,
	Body,
	Container,
	Section,
	Text,
	Heading,
	Preview,
} from "@react-email/components";

interface PortalOtpEmailProps {
	code: string;
	businessName: string;
	expiresInMinutes?: number;
}

export function PortalOtpEmail({
	code,
	businessName,
	expiresInMinutes = 10,
}: PortalOtpEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>
				Your {businessName} sign-in code: {code}
			</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					<Section style={styles.content}>
						<Heading style={styles.heading}>Your sign-in code</Heading>

						<Text style={styles.paragraph}>
							We received a request to sign in to {businessName}&apos;s portal.
							Use this 6-digit code to continue:
						</Text>

						<Section style={styles.codeBox}>
							<Text style={styles.code}>{code}</Text>
						</Section>

						<Text style={styles.paragraph}>
							This code expires in {expiresInMinutes} minutes. If you
							didn&apos;t request it, you can ignore this email.
						</Text>
					</Section>

					<Section style={styles.footer}>
						<Text style={styles.footerText}>Powered by OneTool</Text>
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
		backgroundColor: "#f5f5f5",
	},
	container: {
		maxWidth: "600px",
		margin: "20px auto",
		backgroundColor: "#ffffff",
		borderRadius: "8px",
		overflow: "hidden",
		boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
	},
	content: {
		padding: "32px 24px",
	},
	heading: {
		margin: "0 0 16px 0",
		fontSize: "24px",
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
	codeBox: {
		textAlign: "center" as const,
		backgroundColor: "#f9fafb",
		border: "1px solid #e5e7eb",
		borderRadius: "8px",
		padding: "16px",
		margin: "24px 0",
	},
	code: {
		fontFamily:
			"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
		fontSize: "32px",
		letterSpacing: "8px",
		fontWeight: "600",
		color: "#111827",
		margin: "0",
	},
	footer: {
		backgroundColor: "#f9fafb",
		padding: "16px 24px",
		textAlign: "center" as const,
		borderTop: "1px solid #e5e7eb",
	},
	footerText: {
		margin: "0",
		fontSize: "12px",
		color: "#6b7280",
	},
};

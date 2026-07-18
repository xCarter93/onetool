import React from "react";
import {
	Document,
	Page,
	Text,
	View,
	StyleSheet,
	Image,
} from "@react-pdf/renderer";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { formatCurrency } from "@/lib/money";

type QuoteLineItem = {
	_id: Id<"quoteLineItems">;
	description: string;
	quantity: number;
	unit: string;
	rate: number;
	amount: number;
};

type Quote = {
	_id: Id<"quotes">;
	quoteNumber?: string;
	_creationTime: number;
	validUntil?: number;
	title?: string;
	subtotal: number;
	discountEnabled?: boolean;
	discountAmount?: number;
	discountType?: "percentage" | "fixed";
	taxEnabled?: boolean;
	taxAmount?: number;
	total: number;
	terms?: string;
	clientMessage?: string;
};

type Client = {
	companyName: string;
	streetAddress?: string;
	city?: string;
	state?: string;
	zipCode?: string;
	country?: string;
};

type Organization = {
	name: string;
	logoUrl?: string;
	address?: string;
	phone?: string;
	email?: string;
};

export interface QuotePDFProps {
	quote: Quote;
	client?: Client | null;
	items: QuoteLineItem[];
	organization?: Organization | null;
	countersigner?: { name: string; email: string } | null;
	signingOrder?: "client_first" | "org_first";
}

const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#FFFFFF",
		padding: 40,
		fontSize: 9,
		fontFamily: "Helvetica",
	},
	// Header section
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
		letterSpacing: 6,
		color: "#000000",
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	companyInfo: {
		textAlign: "right",
		marginRight: 12,
	},
	companyName: {
		fontSize: 9,
		fontWeight: "bold",
		marginBottom: 2,
	},
	companyDetail: {
		fontSize: 8,
		color: "#333333",
		lineHeight: 1.4,
	},
	logoContainer: {
		width: 60,
		height: 50,
	},
	logo: {
		width: "100%",
		height: "100%",
		objectFit: "contain",
	},
	// Meta row (quote number, date)
	metaRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 16,
	},
	metaItem: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	metaLabel: {
		fontSize: 9,
		fontWeight: "bold",
		marginRight: 8,
	},
	metaValue: {
		fontSize: 9,
		borderBottomWidth: 1,
		borderBottomColor: "#000000",
		paddingBottom: 2,
		flex: 1,
		maxWidth: 150,
	},
	// Section bar
	sectionBar: {
		backgroundColor: "#000000",
		paddingVertical: 4,
		paddingHorizontal: 8,
		marginBottom: 12,
	},
	sectionBarText: {
		color: "#FFFFFF",
		fontSize: 9,
		fontWeight: "bold",
	},
	// Bill To section
	billToGrid: {
		flexDirection: "row",
		marginBottom: 20,
	},
	billToColumn: {
		flex: 1,
	},
	billToRow: {
		flexDirection: "row",
		marginBottom: 8,
	},
	billToLabel: {
		fontSize: 9,
		width: 80,
		color: "#333333",
	},
	billToValue: {
		fontSize: 9,
		borderBottomWidth: 1,
		borderBottomColor: "#000000",
		paddingBottom: 2,
		flex: 1,
		marginRight: 16,
	},
	// Items table
	table: {
		marginBottom: 16,
	},
	tableHeader: {
		flexDirection: "row",
		borderBottomWidth: 1,
		borderBottomColor: "#000000",
		paddingBottom: 4,
		marginBottom: 4,
	},
	tableRow: {
		flexDirection: "row",
		borderBottomWidth: 0.5,
		borderBottomColor: "#CCCCCC",
		paddingVertical: 6,
	},
	colDescription: {
		flex: 3,
		fontSize: 9,
	},
	colQty: {
		flex: 0.6,
		fontSize: 9,
		textAlign: "center",
	},
	colUnit: {
		flex: 0.6,
		fontSize: 9,
		textAlign: "center",
	},
	colRate: {
		flex: 1,
		fontSize: 9,
		textAlign: "right",
	},
	colAmount: {
		flex: 1,
		fontSize: 9,
		textAlign: "right",
	},
	tableHeaderText: {
		fontWeight: "bold",
		fontSize: 9,
	},
	// Totals section
	totalsSection: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 12,
	},
	totalsContainer: {
		width: 200,
	},
	totalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 3,
	},
	totalLabel: {
		fontSize: 9,
		color: "#333333",
	},
	totalValue: {
		fontSize: 9,
		textAlign: "right",
	},
	grandTotalRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		backgroundColor: "#000000",
		paddingVertical: 6,
		paddingHorizontal: 8,
		marginTop: 4,
	},
	grandTotalLabel: {
		fontSize: 10,
		fontWeight: "bold",
		color: "#FFFFFF",
	},
	grandTotalValue: {
		fontSize: 10,
		fontWeight: "bold",
		color: "#FFFFFF",
	},
	// Terms section
	termsSection: {
		marginTop: 16,
		marginBottom: 12,
	},
	termsBox: {
		borderWidth: 0.5,
		borderColor: "#CCCCCC",
		padding: 10,
	},
	termsLabel: {
		fontSize: 8,
		fontWeight: "bold",
		color: "#333333",
		marginBottom: 4,
	},
	termsText: {
		fontSize: 8,
		color: "#555555",
		lineHeight: 1.4,
	},
	// Signature section
	signatureSection: {
		marginTop: 24,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	signatureBox: {
		width: "45%",
	},
	signatureLabel: {
		fontSize: 9,
		color: "#333333",
		marginBottom: 4,
	},
	signatureLine: {
		borderBottomWidth: 1,
		borderBottomColor: "#000000",
		marginTop: 24,
	},
	// BoldSign hidden text (white on white - used for e-signature positioning)
	boldSignText: {
		fontSize: 8,
		color: "#FFFFFF",
	},
});

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

// validUntil is stored as a UTC-midnight epoch; format in UTC so the day never shifts.
const formatCalendarDate = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone: "UTC",
	});

export const QuotePDF: React.FC<QuotePDFProps> = ({
	quote,
	client,
	items,
	organization,
	countersigner,
	signingOrder = "client_first",
}) => {
	// Calculate signer numbers based on signing order
	const clientSignerNum = signingOrder === "org_first" ? 2 : 1;
	const orgSignerNum = signingOrder === "org_first" ? 1 : 2;

	// Format client address
	const clientAddress = client
		? [
				client.streetAddress,
				[client.city, client.state, client.zipCode].filter(Boolean).join(", "),
				client.country && client.country !== "USA" ? client.country : null,
			]
				.filter(Boolean)
				.join("\n")
		: "";

	return (
		<Document>
			<Page size="A4" style={styles.page}>
				{/* Header */}
				<View style={styles.header}>
					<Text style={styles.title}>QUOTE</Text>
					<View style={styles.headerRight}>
						{organization && (
							<View style={styles.companyInfo}>
								<Text style={styles.companyName}>{organization.name}</Text>
								{organization.address && (
									<Text style={styles.companyDetail}>{organization.address}</Text>
								)}
								{organization.phone && (
									<Text style={styles.companyDetail}>{organization.phone}</Text>
								)}
								{organization.email && (
									<Text style={styles.companyDetail}>{organization.email}</Text>
								)}
							</View>
						)}
						{organization?.logoUrl && (
							<View style={styles.logoContainer}>
								{/* eslint-disable-next-line jsx-a11y/alt-text */}
								<Image style={styles.logo} src={organization.logoUrl} />
							</View>
						)}
					</View>
				</View>

				{/* Meta Row (Quote Number & Dates) */}
				<View style={styles.metaRow}>
					<View style={styles.metaItem}>
						<Text style={styles.metaLabel}>Quote #</Text>
						<Text style={styles.metaValue}>
							{quote.quoteNumber || `#${quote._id.slice(-6)}`}
						</Text>
					</View>
					<View style={styles.metaItem}>
						<Text style={styles.metaLabel}>Date</Text>
						<Text style={styles.metaValue}>{formatDate(quote._creationTime)}</Text>
					</View>
					{quote.validUntil && (
						<View style={styles.metaItem}>
							<Text style={styles.metaLabel}>Valid Until</Text>
							<Text style={styles.metaValue}>
								{formatCalendarDate(quote.validUntil)}
							</Text>
						</View>
					)}
				</View>

				{/* Bill To Section */}
				<View style={styles.sectionBar}>
					<Text style={styles.sectionBarText}>BILL TO:</Text>
				</View>
				<View style={styles.billToGrid}>
					<View style={styles.billToColumn}>
						<View style={styles.billToRow}>
							<Text style={styles.billToLabel}>Client</Text>
							<Text style={styles.billToValue}>
								{client?.companyName || "—"}
							</Text>
						</View>
					</View>
					<View style={styles.billToColumn}>
						<View style={styles.billToRow}>
							<Text style={styles.billToLabel}>Address</Text>
							<Text style={styles.billToValue}>{clientAddress || "—"}</Text>
						</View>
					</View>
				</View>

				{/* Items Table */}
				<View style={styles.sectionBar}>
					<Text style={styles.sectionBarText}>ITEMS:</Text>
				</View>
				<View style={styles.table}>
					<View style={styles.tableHeader}>
						<Text style={[styles.colDescription, styles.tableHeaderText]}>
							Description
						</Text>
						<Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
						<Text style={[styles.colUnit, styles.tableHeaderText]}>Unit</Text>
						<Text style={[styles.colRate, styles.tableHeaderText]}>Rate</Text>
						<Text style={[styles.colAmount, styles.tableHeaderText]}>Amount</Text>
					</View>
					{items.map((item) => (
						<View key={String(item._id)} style={styles.tableRow}>
							<Text style={styles.colDescription}>{item.description}</Text>
							<Text style={styles.colQty}>{item.quantity}</Text>
							<Text style={styles.colUnit}>{item.unit}</Text>
							<Text style={styles.colRate}>{formatCurrency(item.rate)}</Text>
							<Text style={styles.colAmount}>{formatCurrency(item.amount)}</Text>
						</View>
					))}
				</View>

				{/* Totals */}
				<View style={styles.totalsSection}>
					<View style={styles.totalsContainer}>
						<View style={styles.totalRow}>
							<Text style={styles.totalLabel}>Subtotal:</Text>
							<Text style={styles.totalValue}>
								{formatCurrency(quote.subtotal)}
							</Text>
						</View>
						{quote.discountEnabled && quote.discountAmount ? (
							<View style={styles.totalRow}>
								<Text style={styles.totalLabel}>Discount:</Text>
								<Text style={styles.totalValue}>
									{quote.discountType === "percentage"
										? `-${quote.discountAmount}%`
										: `-${formatCurrency(quote.discountAmount)}`}
								</Text>
							</View>
						) : null}
						{quote.taxEnabled && quote.taxAmount ? (
							<View style={styles.totalRow}>
								<Text style={styles.totalLabel}>Tax:</Text>
								<Text style={styles.totalValue}>
									{formatCurrency(quote.taxAmount)}
								</Text>
							</View>
						) : null}
						<View style={styles.grandTotalRow}>
							<Text style={styles.grandTotalLabel}>Total</Text>
							<Text style={styles.grandTotalValue}>
								{formatCurrency(quote.total)}
							</Text>
						</View>
					</View>
				</View>

				{/* Terms & Conditions */}
				{quote.terms && (
					<View style={styles.termsSection}>
						<View style={styles.termsBox}>
							<Text style={styles.termsLabel}>Terms & Conditions:</Text>
							<Text style={styles.termsText}>{quote.terms}</Text>
						</View>
					</View>
				)}

				{/* Client Message */}
				{quote.clientMessage && (
					<View style={styles.termsSection}>
						<View style={styles.termsBox}>
							<Text style={styles.termsLabel}>Note:</Text>
							<Text style={styles.termsText}>{quote.clientMessage}</Text>
						</View>
					</View>
				)}

				{/* Client Signature Section with BoldSign text tags */}
				<View style={styles.signatureSection} wrap={false}>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureLabel}>Client Signature:</Text>
						{/* BoldSign text tag - signer number based on signing order */}
						<Text style={styles.boldSignText}>
							{`{{sign|${clientSignerNum}|*||client_signature}}`}
						</Text>
						<View style={styles.signatureLine} />
					</View>
					<View style={styles.signatureBox}>
						<Text style={styles.signatureLabel}>Date:</Text>
						{/* BoldSign text tag - date field for client */}
						<Text style={styles.boldSignText}>
							{`{{date|${clientSignerNum}|*||client_date_signed}}`}
						</Text>
						<View style={styles.signatureLine} />
					</View>
				</View>

				{/* Organization Countersignature Section (only when countersigner is provided) */}
				{countersigner && (
					<View style={styles.signatureSection} wrap={false}>
						<View style={styles.signatureBox}>
							<Text style={styles.signatureLabel}>
								Authorized by {organization?.name || "Organization"}:
							</Text>
							{/* BoldSign text tag - signer number based on signing order */}
							<Text style={styles.boldSignText}>
								{`{{sign|${orgSignerNum}|*||org_signature}}`}
							</Text>
							<View style={styles.signatureLine} />
						</View>
						<View style={styles.signatureBox}>
							<Text style={styles.signatureLabel}>Date:</Text>
							{/* BoldSign text tag - date field for organization */}
							<Text style={styles.boldSignText}>
								{`{{date|${orgSignerNum}|*||org_date_signed}}`}
							</Text>
							<View style={styles.signatureLine} />
						</View>
					</View>
				)}
			</Page>
		</Document>
	);
};

export default QuotePDF;

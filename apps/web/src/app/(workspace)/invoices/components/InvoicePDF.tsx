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

type InvoiceLineItem = {
	_id: Id<"invoiceLineItems">;
	description: string;
	quantity: number;
	unitPrice: number;
	total: number;
};

type Invoice = {
	_id: Id<"invoices">;
	invoiceNumber: string;
	issuedDate: number;
	dueDate: number;
	status: string;
	subtotal: number;
	discountAmount?: number;
	taxAmount?: number;
	total: number;
	paidAt?: number;
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

type Payment = {
	paymentAmount: number;
	dueDate: number;
	description?: string;
	sortOrder: number;
};

export interface InvoicePDFProps {
	invoice: Invoice;
	client?: Client | null;
	items: InvoiceLineItem[];
	organization?: Organization | null;
	payments?: Payment[];
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
	// Meta row (invoice number, date)
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
		flex: 0.7,
		fontSize: 9,
		textAlign: "center",
	},
	colPrice: {
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
	// Status notices
	noticeSection: {
		marginTop: 16,
	},
	amountDueNotice: {
		backgroundColor: "#FEF3C7",
		padding: 12,
		borderLeftWidth: 3,
		borderLeftColor: "#F59E0B",
	},
	amountDueLabel: {
		fontSize: 10,
		fontWeight: "bold",
		color: "#92400E",
		marginBottom: 2,
	},
	amountDueValue: {
		fontSize: 14,
		fontWeight: "bold",
		color: "#92400E",
	},
	amountDueDate: {
		fontSize: 8,
		color: "#92400E",
		marginTop: 4,
	},
	paidNotice: {
		backgroundColor: "#D1FAE5",
		padding: 12,
		borderLeftWidth: 3,
		borderLeftColor: "#10B981",
	},
	paidText: {
		fontSize: 10,
		fontWeight: "bold",
		color: "#065F46",
	},
	paidSubtext: {
		fontSize: 8,
		color: "#065F46",
		marginTop: 4,
	},
	// Footer
	footer: {
		marginTop: 24,
		borderTopWidth: 1,
		borderTopColor: "#EEEEEE",
		paddingTop: 12,
	},
	footerText: {
		fontSize: 8,
		color: "#666666",
		textAlign: "center",
	},
	// Payment schedule table
	paymentScheduleTable: {
		marginBottom: 16,
	},
	paymentScheduleHeader: {
		flexDirection: "row" as const,
		borderBottomWidth: 1,
		borderBottomColor: "#000000",
		paddingBottom: 4,
		marginBottom: 4,
	},
	paymentScheduleRow: {
		flexDirection: "row" as const,
		borderBottomWidth: 0.5,
		borderBottomColor: "#CCCCCC",
		paddingVertical: 6,
	},
	colPayDescription: {
		flex: 3,
		fontSize: 9,
	},
	colPayAmount: {
		flex: 1,
		fontSize: 9,
		textAlign: "right" as const,
	},
	colPayDueDate: {
		flex: 1,
		fontSize: 9,
		textAlign: "right" as const,
	},
});

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
		amount
	);

const formatDate = (timestamp: number) =>
	new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});

export const InvoicePDF: React.FC<InvoicePDFProps> = ({
	invoice,
	client,
	items,
	organization,
	payments,
}) => {
	const isPaid = invoice.status === "paid";
	const isOverdue =
		!isPaid && invoice.status === "sent" && invoice.dueDate < Date.now();

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
					<Text style={styles.title}>INVOICE</Text>
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

				{/* Meta Row (Invoice Number & Date) */}
				<View style={styles.metaRow}>
					<View style={styles.metaItem}>
						<Text style={styles.metaLabel}>Invoice #</Text>
						<Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
					</View>
					<View style={styles.metaItem}>
						<Text style={styles.metaLabel}>Issued</Text>
						<Text style={styles.metaValue}>{formatDate(invoice.issuedDate)}</Text>
					</View>
					<View style={styles.metaItem}>
						<Text style={styles.metaLabel}>Due Date</Text>
						<Text style={styles.metaValue}>{formatDate(invoice.dueDate)}</Text>
					</View>
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
						<Text style={[styles.colPrice, styles.tableHeaderText]}>
							Unit Price
						</Text>
						<Text style={[styles.colAmount, styles.tableHeaderText]}>
							Amount
						</Text>
					</View>
					{items.map((item) => (
						<View key={String(item._id)} style={styles.tableRow}>
							<Text style={styles.colDescription}>{item.description}</Text>
							<Text style={styles.colQty}>{item.quantity}</Text>
							<Text style={styles.colPrice}>{formatCurrency(item.unitPrice)}</Text>
							<Text style={styles.colAmount}>{formatCurrency(item.total)}</Text>
						</View>
					))}
				</View>

				{/* Totals */}
				<View style={styles.totalsSection}>
					<View style={styles.totalsContainer}>
						<View style={styles.totalRow}>
							<Text style={styles.totalLabel}>Subtotal:</Text>
							<Text style={styles.totalValue}>
								{formatCurrency(invoice.subtotal)}
							</Text>
						</View>
						{invoice.discountAmount ? (
							<View style={styles.totalRow}>
								<Text style={styles.totalLabel}>Discount:</Text>
								<Text style={styles.totalValue}>
									-{formatCurrency(invoice.discountAmount)}
								</Text>
							</View>
						) : null}
						{invoice.taxAmount ? (
							<View style={styles.totalRow}>
								<Text style={styles.totalLabel}>Tax:</Text>
								<Text style={styles.totalValue}>
									{formatCurrency(invoice.taxAmount)}
								</Text>
							</View>
						) : null}
						<View style={styles.grandTotalRow}>
							<Text style={styles.grandTotalLabel}>Total</Text>
							<Text style={styles.grandTotalValue}>
								{formatCurrency(invoice.total)}
							</Text>
						</View>
					</View>
				</View>

				{/* Payment Schedule */}
				{payments && payments.length > 1 && (
					<>
						<View style={{ marginTop: 16 }}>
							<View style={styles.sectionBar}>
								<Text style={styles.sectionBarText}>PAYMENT SCHEDULE:</Text>
							</View>
							<View style={styles.paymentScheduleTable}>
								<View style={styles.paymentScheduleHeader}>
									<Text style={[styles.colPayDescription, styles.tableHeaderText]}>
										Description
									</Text>
									<Text style={[styles.colPayAmount, styles.tableHeaderText]}>
										Amount
									</Text>
									<Text style={[styles.colPayDueDate, styles.tableHeaderText]}>
										Due Date
									</Text>
								</View>
								{payments.map((payment, index) => (
									<View key={index} style={styles.paymentScheduleRow}>
										<Text style={styles.colPayDescription}>
											{payment.description || `Payment ${index + 1}`}
										</Text>
										<Text style={styles.colPayAmount}>
											{formatCurrency(payment.paymentAmount)}
										</Text>
										<Text style={styles.colPayDueDate}>
											{formatDate(payment.dueDate)}
										</Text>
									</View>
								))}
							</View>
						</View>
					</>
				)}

				{/* Payment Status Notices */}
				<View style={styles.noticeSection}>
					{!isPaid && (
						<View style={styles.amountDueNotice}>
							<Text style={styles.amountDueLabel}>
								{isOverdue ? "AMOUNT OVERDUE" : "AMOUNT DUE"}
							</Text>
							<Text style={styles.amountDueValue}>
								{formatCurrency(invoice.total)}
							</Text>
							<Text style={styles.amountDueDate}>
								Payment due by {formatDate(invoice.dueDate)}
							</Text>
						</View>
					)}
					{isPaid && (
						<View style={styles.paidNotice}>
							<Text style={styles.paidText}>
								✓ Payment received
								{invoice.paidAt && ` on ${formatDate(invoice.paidAt)}`}
							</Text>
							<Text style={styles.paidSubtext}>Thank you for your business!</Text>
						</View>
					)}
				</View>

				{/* Footer */}
				<View style={styles.footer}>
					<Text style={styles.footerText}>
						This invoice was generated electronically and is valid without a
						signature.
					</Text>
					{organization?.name && (
						<Text style={styles.footerText}>
							{organization.name} • {invoice.invoiceNumber}
						</Text>
					)}
				</View>
			</Page>
		</Document>
	);
};

export default InvoicePDF;

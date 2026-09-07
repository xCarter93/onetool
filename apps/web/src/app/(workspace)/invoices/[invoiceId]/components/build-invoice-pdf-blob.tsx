import { pdf } from "@react-pdf/renderer";
import InvoicePDF, {
	type InvoicePDFProps,
} from "@onetool/backend/pdf/InvoicePDF";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

export interface BuildInvoicePdfArgs {
	invoice: InvoicePDFProps["invoice"];
	lineItems: InvoicePDFProps["items"];
	payments?: InvoicePDFProps["payments"];
	invoiceGroups?: InvoicePDFProps["invoiceGroups"];
	client?: Doc<"clients"> | null;
	organization?: Doc<"organizations"> | null;
	primaryProperty?: Doc<"clientProperties"> | null;
}

/**
 * Single source of truth for the invoice PDF render. Preview and Generate both
 * go through here so the document a user approves is the one that gets
 * uploaded. `invoice` is passed whole, so pdfSettings (column visibility) and
 * the pricing-mode fields resolve identically on both paths.
 */
export async function buildInvoicePdfBlob({
	invoice,
	lineItems,
	payments,
	invoiceGroups,
	client,
	organization,
	primaryProperty,
}: BuildInvoicePdfArgs): Promise<Blob> {
	const element = (
		<InvoicePDF
			invoice={invoice}
			client={
				client
					? {
							companyName: client.companyName,
							streetAddress: primaryProperty?.streetAddress,
							city: primaryProperty?.city,
							state: primaryProperty?.state,
							zipCode: primaryProperty?.zipCode,
							country: primaryProperty?.country,
						}
					: undefined
			}
			items={lineItems}
			organization={
				organization
					? {
							name: organization.name,
							logoUrl: organization.logoUrl || undefined,
							address: organization.address || undefined,
							phone: organization.phone || undefined,
							email: organization.email || undefined,
						}
					: undefined
			}
			payments={payments}
			invoiceGroups={invoiceGroups}
		/>
	);

	return pdf(element).toBlob();
}

import { pdf } from "@react-pdf/renderer";
import QuotePDF from "@/app/(workspace)/quotes/components/QuotePDF";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";

export interface BuildQuotePdfArgs {
	quote: Doc<"quotes">;
	lineItems: Doc<"quoteLineItems">[];
	client?: Doc<"clients"> | null;
	organization?: Doc<"organizations"> | null;
	primaryProperty?: Doc<"clientProperties"> | null;
	countersigner?: { name?: string | null; email: string } | null;
}

/**
 * Single source of truth for the quote PDF render. Preview and Generate both
 * go through here so the document a user approves is byte-identical to the one
 * that gets uploaded. `quote` is passed whole, so any template-level settings
 * (including quote.pdfSettings) resolve the same way on both paths.
 */
export async function buildQuotePdfBlob({
	quote,
	lineItems,
	client,
	organization,
	primaryProperty,
	countersigner,
}: BuildQuotePdfArgs): Promise<Blob> {
	const element = (
		<QuotePDF
			quote={quote}
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
			countersigner={
				quote.requiresCountersignature && countersigner
					? {
							name: countersigner.name || countersigner.email,
							email: countersigner.email,
						}
					: null
			}
			signingOrder={quote.signingOrder}
		/>
	);

	return pdf(element).toBlob();
}

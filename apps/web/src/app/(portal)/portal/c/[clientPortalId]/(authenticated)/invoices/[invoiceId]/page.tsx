import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { readSessionCookie } from "@/lib/portal/cookie";
import { InvoiceDetailIsland } from "@/components/portal/invoices/invoice-detail-island";
import { HeaderActionsClient } from "@/components/portal/invoices/header-actions-client";

export default async function InvoiceDetailPage({
	params,
}: {
	params: Promise<{ clientPortalId: string; invoiceId: string }>;
}) {
	const { clientPortalId, invoiceId: rawId } = await params;
	const invoiceId = rawId as Id<"invoices">;

	const token = (await readSessionCookie()) ?? undefined;
	if (!token) {
		redirect(`/portal/c/${clientPortalId}/verify`);
	}

	let data;
	let pdfResult: { url: string } | null;
	try {
		[data, pdfResult] = await Promise.all([
			fetchQuery(api.portal.invoices.get, { invoiceId }, { token }),
			fetchQuery(
				api.portal.invoices.getDownloadUrl,
				{ invoiceId },
				{ token },
			),
		]);
	} catch {
		// NOT_FOUND, FORBIDDEN, draft/cancelled masquerade — all collapse to 404.
		notFound();
		return null;
	}

	if (!data) {
		notFound();
		return null;
	}

	const hasPdf = pdfResult !== null;

	return (
		<div className="-mx-6 md:-mx-9 -my-6 flex flex-col">
			<header
				data-sticky-detail-header
				className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-4 border-b border-border bg-background px-6 md:px-9"
			>
				<div className="flex min-w-0 items-center gap-3">
					<Link
						href={`/portal/c/${clientPortalId}/invoices`}
						className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
						Back to Invoices
					</Link>
					<div className="hidden h-5 w-px bg-border md:block" />
					<h2 className="hidden md:block truncate text-[16px] font-semibold">
						Invoice #{data.invoice.invoiceNumber}
					</h2>
				</div>
				<HeaderActionsClient invoiceId={invoiceId} hasPdf={hasPdf} />
			</header>

			{/* Mobile-only title block */}
			<div className="border-b border-border bg-background px-6 py-4 md:hidden">
				<h2 className="text-[16px] font-semibold">
					Invoice #{data.invoice.invoiceNumber}
				</h2>
			</div>

			<InvoiceDetailIsland
				data={data}
				clientPortalId={clientPortalId}
				hasPdf={hasPdf}
			/>
		</div>
	);
}

"use client";

import { DownloadPdfButton } from "./download-pdf-button";
import { PrintButton } from "./print-button";

export function HeaderActionsClient({
	invoiceId,
	hasPdf,
}: {
	invoiceId: string;
	hasPdf: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<DownloadPdfButton invoiceId={invoiceId} hasPdf={hasPdf} />
			<PrintButton />
		</div>
	);
}

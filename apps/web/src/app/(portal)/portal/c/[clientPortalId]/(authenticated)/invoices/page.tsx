import { ReceiptText } from "lucide-react";

export default function InvoicesPlaceholderPage() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="max-w-md w-full text-center flex flex-col items-center gap-4">
				<div className="rounded-full bg-muted p-4">
					<ReceiptText
						className="h-8 w-8 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
				<h1 className="text-xl font-semibold">
					Invoices coming soon — Phase 15
				</h1>
				<p className="text-sm text-muted-foreground">
					You&apos;ll be able to view, download, and pay invoices from this
					portal once Phase 15 ships. Your provider will continue to send
					invoices via email until then.
				</p>
			</div>
		</div>
	);
}

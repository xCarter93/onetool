import { FileText } from "lucide-react";

export default function QuotesPlaceholderPage() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="max-w-md w-full text-center flex flex-col items-center gap-4">
				<div className="rounded-full bg-muted p-4">
					<FileText
						className="h-8 w-8 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
				<h1 className="text-xl font-semibold">Quotes coming soon — Phase 14</h1>
				<p className="text-sm text-muted-foreground">
					You&apos;ll be able to review, approve, and sign quotes directly from
					this portal once Phase 14 ships. In the meantime, your provider will
					continue to send quotes via email.
				</p>
			</div>
		</div>
	);
}

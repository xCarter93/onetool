import { ExternalLink, Mail } from "lucide-react";

export interface LegacyInvoiceNoticeProps {
	legacyPayUrl: string;
	businessName: string;
}

export function LegacyInvoiceNotice({
	legacyPayUrl,
	businessName,
}: LegacyInvoiceNoticeProps) {
	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start gap-3">
				<span
					className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
					aria-hidden="true"
				>
					<Mail className="h-4 w-4" />
				</span>
				<div className="min-w-0">
					<h3 className="text-[15px] font-semibold text-foreground">
						Pay via your invoice email link
					</h3>
					<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
						This invoice uses the older payment flow. Use the link in your
						invoice email from{" "}
						<span className="font-medium text-foreground">{businessName}</span>
						, or open it directly:
					</p>
					<a
						href={legacyPayUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted"
					>
						Open payment page
						<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
					</a>
				</div>
			</div>
		</div>
	);
}

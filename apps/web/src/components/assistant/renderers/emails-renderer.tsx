"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { ToolRendererProps } from "./index";

// Mirrors searchClientEmails' Capped<EmailItem> output in convex/assistantTools.ts.
interface EmailsOutput {
	items: Array<{
		direction: string;
		subject: string;
		preview?: string;
		from: string;
		to: string;
		status: string;
		sentAt: number;
		threadId?: string;
	}>;
	totalCount: number;
	truncated: boolean;
}

const ROW_CAP = 8;

function formatSentAt(ms: number) {
	return new Date(ms).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function EmailsRenderer({ output }: ToolRendererProps) {
	const result = output as EmailsOutput;
	const emails = Array.isArray(result?.items) ? result.items : [];

	if (emails.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
				No emails found.
			</div>
		);
	}

	const hidden = Math.max(result.totalCount, emails.length) - ROW_CAP;

	return (
		<div className="rounded-xl border border-border bg-card px-3.5 py-1">
			<div className="divide-y divide-border/60">
				{emails.slice(0, ROW_CAP).map((email, i) => {
					const outbound = email.direction === "outbound";
					return (
						<div key={i} className="py-2">
							<div className="flex items-baseline justify-between gap-3">
								<div className="flex min-w-0 items-center gap-1.5">
									{outbound ? (
										<ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
									) : (
										<ArrowDownLeft className="size-3 shrink-0 text-primary" />
									)}
									<p className="truncate text-sm text-foreground">
										{email.subject || "(no subject)"}
									</p>
								</div>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatSentAt(email.sentAt)}
								</span>
							</div>
							<p className="mt-0.5 truncate pl-[18px] text-xs text-muted-foreground">
								{outbound ? `To ${email.to}` : `From ${email.from}`}
								{email.preview ? ` — ${email.preview}` : ""}
							</p>
						</div>
					);
				})}
			</div>
			{hidden > 0 && (
				<p className="pb-2 pt-1 text-xs text-muted-foreground">
					+{hidden} more
				</p>
			)}
		</div>
	);
}

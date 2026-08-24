"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser, useOrganization } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

import { CreateRecordDialog } from "@/components/domain/create-record-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
	isSupportAvailable,
	rememberTicketIntent,
	sendSupportMessage,
	SUPPORT_INTENT_PREFIX,
	type SupportIntent,
	waitForSupportAvailable,
} from "@/lib/support";
import { refreshSupportTickets } from "@/lib/support-tickets";

export type { SupportIntent };

const MAX_DETAIL_LENGTH = 2000;

const INTENT_COPY: Record<
	SupportIntent,
	{
		title: string;
		description: string;
		detailLabel: string;
		detailPlaceholder: string;
		/** V2-3: per-intent post-submit promise. */
		toastTitle: string;
		toastDescription: string;
	}
> = {
	contact: {
		title: "Contact support",
		description: "Questions, billing, anything — we read every message.",
		detailLabel: "How can we help?",
		detailPlaceholder: "Tell us what you need…",
		toastTitle: "Message sent",
		toastDescription: "We'll reply within one business day.",
	},
	bug: {
		title: "Report a bug",
		description:
			"The technical details (page, session, errors) attach automatically.",
		detailLabel: "What happened instead?",
		detailPlaceholder: "What you saw, including any error message…",
		toastTitle: "Bug report sent",
		toastDescription: "We'll investigate and reply within one business day.",
	},
	feature: {
		title: "Request a feature",
		description: "Tell us what OneTool should do next.",
		detailLabel: "What would you like OneTool to do?",
		detailPlaceholder: "The task you're trying to get done…",
		toastTitle: "Thanks — we've logged it",
		toastDescription: "We'll email you if we ship it or need more detail.",
	},
};

interface SupportDialogProps {
	intent: SupportIntent;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
}

/**
 * One dialog for all three support intents; creates a PostHog Support ticket
 * via conversations.sendMessage. Widget tickets auto-attach replay, events,
 * errors, and identity, so the form stays minimal (no severity/category —
 * D12). When the conversations module can't load (ad blockers), falls back
 * to a mailto link.
 */
export function SupportDialog({
	intent,
	open,
	onOpenChange,
	onOpenChangeComplete,
}: SupportDialogProps) {
	const copy = INTENT_COPY[intent];
	const pathname = usePathname();
	const router = useRouter();
	const { user } = useUser();
	const { organization } = useOrganization();
	const entitlements = useQuery(api.entitlements.getMine, {});
	const toast = useToast();

	const [tryingTo, setTryingTo] = React.useState("");
	const [detail, setDetail] = React.useState("");
	const [submitting, setSubmitting] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);

	// Reset when closing — during render via the previous-value pattern
	// (setState-in-effect is a lint error in apps/web).
	const [prevOpen, setPrevOpen] = React.useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (!open) {
			setTryingTo("");
			setDetail("");
			setSubmitting(false);
			setSubmitError(null);
		}
	}

	// The PostHog SDK loads async: a render-only check could freeze the dialog
	// in its "unavailable" branch when opened right after page load.
	const [available, setAvailable] = React.useState(isSupportAvailable);
	React.useEffect(() => {
		if (!open || available) return;
		let cancelled = false;
		void waitForSupportAvailable().then((ok) => {
			if (!cancelled && ok) setAvailable(true);
		});
		return () => {
			cancelled = true;
		};
	}, [open, available]);
	const email = user?.primaryEmailAddress?.emailAddress ?? "";
	const canSubmit =
		available &&
		detail.trim().length > 0 &&
		(intent !== "bug" || tryingTo.trim().length > 0);

	const handleSubmit = async () => {
		if (submitting || !canSubmit) return;
		setSubmitting(true);
		setSubmitError(null);

		// D13: visible intent line first (Workflow tag match), then the user's
		// text, then a compact context block.
		const body =
			intent === "bug"
				? `Trying to: ${tryingTo.trim()}\nWhat happened: ${detail.trim()}`
				: detail.trim();
		const context = [
			organization?.name,
			entitlements?.plan,
			pathname,
			"web",
		]
			.filter(Boolean)
			.join(" · ");
		const message = `${SUPPORT_INTENT_PREFIX[intent]}\n\n${body}\n\n— ${context}`;

		const ticketId = await sendSupportMessage(message, {
			name: user?.fullName ?? undefined,
			email: email || undefined,
		});
		setSubmitting(false);

		if (!ticketId) {
			setSubmitError(
				"That didn't go through. Try again, or email support@onetool.biz."
			);
			return;
		}

		rememberTicketIntent(ticketId, intent);
		void refreshSupportTickets();
		onOpenChange(false);
		toast.success(copy.toastTitle, copy.toastDescription, {
			action: { label: "View request", onClick: () => router.push("/support") },
		});
	};

	return (
		<CreateRecordDialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			title={copy.title}
			description={copy.description}
			submitLabel="Send message"
			submittingLabel="Sending…"
			isSubmitting={submitting}
			canSubmit={canSubmit}
			onSubmit={handleSubmit}
			className="max-w-lg"
		>
			{available ? (
				<>
					<FieldGroup>
						{intent === "bug" && (
							<Field>
								<FieldLabel htmlFor="support-trying-to">
									What were you trying to do?
								</FieldLabel>
								<Input
									id="support-trying-to"
									value={tryingTo}
									onChange={(e) => setTryingTo(e.target.value)}
									placeholder="e.g., Send a quote to a client"
									maxLength={200}
									autoFocus
								/>
							</Field>
						)}
						<Field>
							<FieldLabel htmlFor="support-detail">
								{copy.detailLabel}
							</FieldLabel>
							<Textarea
								id="support-detail"
								value={detail}
								onChange={(e) => setDetail(e.target.value)}
								placeholder={copy.detailPlaceholder}
								rows={5}
								maxLength={MAX_DETAIL_LENGTH}
								autoFocus={intent !== "bug"}
							/>
							<span className="self-end text-xs tabular-nums text-muted-foreground">
								{detail.length}/{MAX_DETAIL_LENGTH}
							</span>
						</Field>
					</FieldGroup>

					{submitError && (
						<p
							role="alert"
							className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
						>
							{submitError}
						</p>
					)}

					<div className="space-y-1 text-xs text-muted-foreground">
						{email && (
							<p>
								A real person reads every message — we&apos;ll reply to{" "}
								<span className="font-medium text-foreground">{email}</span>{" "}
								within one business day.
							</p>
						)}
						<p>Please don&apos;t include client payment details.</p>
					</div>
				</>
			) : (
				<p className="text-sm text-muted-foreground">
					Support chat couldn&apos;t load — this is usually an ad blocker.
					Email us instead at{" "}
					<a
						href="mailto:support@onetool.biz"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						support@onetool.biz
					</a>{" "}
					and we&apos;ll reply within one business day.
				</p>
			)}
		</CreateRecordDialog>
	);
}

"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { useSupportDialog } from "@/components/support/support-dialog-provider";
import { recallTicketIntents, type SupportIntent } from "@/lib/support";
import {
	refreshSupportTickets,
	useSupportTickets,
} from "@/lib/support-tickets";
import { cn } from "@/lib/utils";
import { isResolved } from "../lib/support-utils";
import { TicketList } from "./ticket-list";
import { TicketView, TicketViewEmpty } from "./ticket-view";
import { EmptyState } from "@/components/domain/empty-state";

export function SupportScreen() {
	const { status, tickets, refreshing } = useSupportTickets();
	const openSupport = useSupportDialog();
	const { user } = useUser();

	const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(
		null
	);
	const [showResolved, setShowResolved] = React.useState(false);
	const [intents, setIntents] = React.useState<Record<string, SupportIntent>>(
		() => (typeof window === "undefined" ? {} : recallTicketIntents())
	);

	// Fetch on navigate (V2-2). The identity effect usually got here first;
	// this covers direct loads and the no-identity dev fallback.
	React.useEffect(() => {
		void refreshSupportTickets();
	}, []);

	const resolvedCount = React.useMemo(
		() => tickets.filter((t) => isResolved(t.status)).length,
		[tickets]
	);
	const visibleTickets = React.useMemo(
		() => (showResolved ? tickets : tickets.filter((t) => !isResolved(t.status))),
		[tickets, showResolved]
	);

	const handleIntentDiscovered = React.useCallback(
		(ticketId: string, intent: SupportIntent) => {
			setIntents((prev) =>
				prev[ticketId] === intent ? prev : { ...prev, [ticketId]: intent }
			);
		},
		[]
	);

	const replyTraits = React.useMemo(
		() => ({
			name: user?.fullName ?? undefined,
			email: user?.primaryEmailAddress?.emailAddress ?? undefined,
		}),
		[user]
	);

	const hasSelection = selectedTicketId !== null;
	const unavailable = status === "unavailable";

	return (
		<div
			// Same pane insets as the Inbox: clear the top notch rail and the
			// bottom Assistant notch.
			className="flex h-full min-h-0 gap-3 overflow-hidden px-3 pb-12 pt-3 md:pt-10"
		>
			<aside
				className={cn(
					"w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex md:w-[340px] md:shrink-0",
					"min-h-0",
					hasSelection ? "hidden md:flex" : "flex"
				)}
			>
				{unavailable ? (
					<div className="flex h-full items-center p-4">
						<EmptyState
							size="sm"
							illustration="messages-none"
							title="Support couldn't load"
							description="This is usually an ad blocker. Email us at support@onetool.biz and we'll reply within one business day."
						/>
					</div>
				) : (
					<TicketList
						loading={status === "idle" || status === "loading"}
						tickets={visibleTickets}
						intents={intents}
						hiddenResolvedCount={resolvedCount}
						showResolved={showResolved}
						onShowResolvedChange={setShowResolved}
						selectedTicketId={selectedTicketId}
						onSelect={setSelectedTicketId}
						onNewRequest={openSupport}
						onRefresh={() => void refreshSupportTickets()}
						refreshing={refreshing}
					/>
				)}
			</aside>

			<section
				className={cn(
					"min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex",
					"min-h-0",
					hasSelection ? "flex" : "hidden md:flex"
				)}
			>
				{selectedTicketId ? (
					<TicketView
						key={selectedTicketId}
						ticketId={selectedTicketId}
						intent={intents[selectedTicketId]}
						onIntentDiscovered={handleIntentDiscovered}
						onBack={() => setSelectedTicketId(null)}
						onNewRequest={() => openSupport("contact")}
						replyTraits={replyTraits}
					/>
				) : (
					<TicketViewEmpty />
				)}
			</section>
		</div>
	);
}

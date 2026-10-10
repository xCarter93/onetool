"use client";
import { useEffect, useRef, useState } from "react";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelBar } from "./feature";
import { useMotionPaused } from "../motion-pause";
import { useInView } from "../use-in-view";
import { useCellLive } from "./use-cell-live";

type Thread = {
	contact: string;
	client: string;
	subject: string;
	preview: string;
	time: string;
	unread?: boolean;
};

const ARRIVING: Thread = {
	contact: "M. Dunmore",
	client: "Dunmore Residence",
	subject: "Re: Quote Q-001047",
	preview: "Signed. Could the crew come Thursday instead?",
	time: "Just now",
	unread: true,
};

const EARLIER: Thread[] = [
	{
		contact: "Luis Ortega",
		client: "Ortega Residence",
		subject: "Re: Invoice INV-002079",
		preview: "Paid online. Thanks for fitting us in.",
		time: "1 hour ago",
	},
	{
		contact: "Priya Patel",
		client: "Patel Family Dental",
		subject: "Window cleaning on Thursday",
		preview: "We close 12 to 1 for lunch. Side door code is 2210.",
		time: "2 hours ago",
	},
	{
		contact: "Janet Moss",
		client: "Kerr Road HOA",
		subject: "Re: Weekly mow",
		preview: "You: We’ll skip the 13th if it rains.",
		time: "1 day ago",
	},
	{
		contact: "Grace Harlow",
		client: "Harlow Residence",
		subject: "Re: Quote Q-001052",
		preview: "Could you do the 15th instead? We have guests the week before.",
		time: "1 day ago",
	},
	{
		contact: "Birch Grove HOA",
		client: "Birch Grove HOA",
		subject: "Leaf removal, Tuesday",
		preview: "The east gate opens at 7. Park by the clubhouse.",
		time: "2 days ago",
	},
];

function Row({ thread, last = false }: { thread: Thread; last?: boolean }) {
	return (
		<div className={cn("flex gap-2 px-4 py-2", !last && "border-b border-(--rule)")}>
			<span
				className={cn(
					"mt-[7px] size-1.5 shrink-0 rounded-full",
					thread.unread ? "bg-(--accent-ink)" : "bg-transparent"
				)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-3">
					<p className={cn("text-sm text-(--ink)", thread.unread ? "font-semibold" : "font-medium")}>
						<span className="hidden @md:inline">{thread.contact} · </span>
						{thread.client}
					</p>
					<span className="shrink-0 text-xs tabular-nums text-(--ink-2)">{thread.time}</span>
				</div>
				<p className={cn("text-xs text-(--ink)", thread.unread && "font-medium")}>{thread.subject}</p>
				<p className="text-xs text-(--ink-2)">{thread.preview}</p>
			</div>
		</div>
	);
}

export function InboxCell() {
	const ref = useRef<HTMLDivElement>(null);
	const live = useCellLive(ref);
	const seen = useInView(ref, { once: true, amount: 0.6 });
	const paused = useMotionPaused();
	const [arrived, setArrived] = useState(false);
	// Paused visitors still get the finished state the panel's label describes.
	const shown = arrived || (seen && paused);

	useEffect(() => {
		if (!live || !seen || arrived) return;
		const timer = window.setTimeout(() => setArrived(true), 500);
		return () => window.clearTimeout(timer);
	}, [live, seen, arrived]);

	return (
		<div ref={ref} className="flex h-full flex-col">
			<PanelBar>
				<span className="text-sm font-semibold text-(--ink)">Inbox</span>
				<SquarePen aria-hidden="true" className="size-4 text-(--ink-2)" />
			</PanelBar>
			<div
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-500 ease-(--lp-ease) motion-reduce:transition-opacity",
					shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<Row thread={ARRIVING} />
				</div>
			</div>
			{EARLIER.map((thread, index) => (
				<Row key={thread.subject} thread={thread} last={index === EARLIER.length - 1} />
			))}
		</div>
	);
}

import { ArrowRight, MoreHorizontal } from "lucide-react";
import { StatusBadge, type StatusRole } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";

// Labels, columns and status roles mirror the Community page's RequestsTable.
type Request = {
	name: string;
	email: string;
	message: string;
	service: string;
	received: string;
	status: { label: string; role: StatusRole };
};

const REQUESTS: Request[] = [
	{
		name: "Grace Harlow",
		email: "grace.harlow@example.com",
		message: "Our lawn is thin after the summer. Could you aerate and overseed before it gets cold?",
		service: "Lawn care",
		received: "25 minutes ago",
		status: { label: "New", role: "info" },
	},
	{
		name: "Rachel Whitfield",
		email: "rachel@example.net",
		message: "Fall cleanup and fresh mulch for the beds at 412 Ashfield Ct.",
		service: "Fall cleanup",
		received: "1 week ago",
		status: { label: "Client", role: "success" },
	},
	{
		name: "Priya Patel",
		email: "priya.patel@example.org",
		message: "Inside and outside windows for our office, before the holidays.",
		service: "Window cleaning",
		received: "2 weeks ago",
		status: { label: "Client", role: "success" },
	},
];

const COLUMNS =
	"grid grid-cols-[minmax(0,1fr)_5rem_28px] @lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_5rem_28px] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.7fr)_7.5rem_5rem_28px] items-center gap-x-4";

export function RequestsCell() {
	return (
		<div className="flex h-full flex-col bg-(--paper) p-[3px]">
			<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
				<div className="min-w-0">
					<p className="text-sm font-semibold text-(--ink)">Requests from your page</p>
					<p className="text-xs text-(--ink-2)">
						Every submission also creates a follow-up task. Add someone as a client when you are ready.
					</p>
				</div>
				<div className="flex items-center gap-2 text-xs font-medium">
					<span className="flex rounded-sm border border-(--rule-2)">
						<span className="px-2.5 py-1 text-(--ink-2)">New (1)</span>
						<span className="border-l border-(--rule-2) bg-(--sheet) px-2.5 py-1 text-(--ink)">All</span>
					</span>
					<span className="hidden items-center gap-1.5 rounded-sm border border-(--rule-2) bg-(--sheet) px-2.5 py-1 text-(--ink) @xl:inline-flex">
						Open in Tasks
						<ArrowRight aria-hidden="true" className="size-3.5" />
					</span>
				</div>
			</div>
			<div className="flex-1 overflow-hidden rounded-lg bg-(--sheet) text-sm">
				<div className={cn(COLUMNS, "border-b border-(--rule) bg-(--paper) px-4 py-2 text-2xs font-semibold uppercase tracking-[0.03em] text-(--ink-3)")}>
					<span>Name</span>
					<span className="hidden @3xl:block">Message</span>
					<span className="hidden @lg:block">Service</span>
					<span className="hidden @3xl:block">Received</span>
					<span>Status</span>
					<span />
				</div>
				{REQUESTS.map((request) => (
					<div key={request.email} className={cn(COLUMNS, "border-b border-(--rule) px-4 py-2.5 last:border-b-0")}>
						<span className="min-w-0">
							<span className="block truncate font-medium text-(--ink)">{request.name}</span>
							<span className="block truncate text-xs text-(--ink-2)">{request.email}</span>
						</span>
						<span className="hidden text-(--ink-2) @3xl:block">
							<span className="line-clamp-2">{request.message}</span>
						</span>
						<span className="hidden truncate text-(--ink-2) @lg:block">{request.service}</span>
						<span className="hidden whitespace-nowrap text-(--ink-2) @3xl:block">{request.received}</span>
						<StatusBadge role={request.status.role}>{request.status.label}</StatusBadge>
						<MoreHorizontal aria-hidden="true" className="size-4 justify-self-end text-(--ink-3)" />
					</div>
				))}
			</div>
		</div>
	);
}

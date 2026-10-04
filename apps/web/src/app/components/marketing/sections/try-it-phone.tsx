import type { LucideIcon } from "lucide-react";
import {
	ArrowLeft,
	BatteryFull,
	Check,
	CheckCircle2,
	ChevronDown,
	CircleCheck,
	Download,
	FileText,
	Home,
	Lock,
	LogOut,
	Moon,
	Receipt,
	ReceiptText,
	Signal,
	Wifi,
} from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";

/** iPhone 15 viewport in CSS px; the caller scales it into the frame. */
export const SCREEN_W = 390;
export const SCREEN_H = 844;

export const PRESSABLE = "transition-transform duration-150 data-[pressed=true]:scale-[0.96]";

export type PhoneScreen = "home" | "quote" | "approved" | "invoice" | "paid";

export type PhoneLine = { id: string; name: string; price: number };

type Totals = { subtotal: number; tax: number; total: number };

const BUSINESS = "Ridgeline Home Services";

const CLOCK: Record<PhoneScreen, string> = {
	home: "10:36",
	quote: "10:38",
	approved: "10:42",
	invoice: "1:40",
	paid: "1:52",
};

const ACTIVITY: { title: string; meta: string; time: string; icon: LucideIcon; tint: string }[] = [
	{
		title: "Invoice INV-002071 paid",
		meta: `Gutter clearing · ${formatCurrency(180)}`,
		time: "Sep 12",
		icon: CircleCheck,
		tint: "bg-(--paid-wash) text-(--paid)",
	},
	{
		title: "Quote Q-001031 accepted",
		meta: "Gutter clearing",
		time: "Sep 8",
		icon: FileText,
		tint: "bg-(--accent-wash) text-(--accent-ink)",
	},
	{
		title: "Invoice INV-001988 paid",
		meta: `Spring cleanup · ${formatCurrency(640)}`,
		time: "Apr 3",
		icon: Receipt,
		tint: "bg-[color-mix(in_oklch,var(--amber)_14%,transparent)] text-(--amber)",
	},
];

const TABS: { label: string; icon: LucideIcon }[] = [
	{ label: "Home", icon: Home },
	{ label: "Quotes", icon: FileText },
	{ label: "Invoices", icon: ReceiptText },
	{ label: "Sign out", icon: LogOut },
];

/** Rachel's phone on the Ridgeline client portal, laid out like the real mobile portal screens. */
export function ClientPhone({
	screen,
	lines,
	totals,
	pressed,
}: {
	screen: PhoneScreen;
	lines: PhoneLine[];
	totals: Totals;
	pressed: string | null;
}) {
	return (
		<div className="lp-ios relative flex h-[844px] w-[390px] flex-col overflow-hidden bg-(--paper) text-left text-(--ink)">
			<StatusBar time={CLOCK[screen]} />
			<BrandBar />
			{screen === "home" ? <PortalHome /> : null}
			{screen === "quote" || screen === "approved" ? (
				<QuoteView approved={screen === "approved"} lines={lines} totals={totals} pressed={pressed} />
			) : null}
			{screen === "invoice" || screen === "paid" ? (
				<InvoiceView paid={screen === "paid"} lines={lines} total={totals.total} pressed={pressed} />
			) : null}
			<span className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-(--ink)" />
		</div>
	);
}

function StatusBar({ time }: { time: string }) {
	return (
		<div className="flex h-[54px] flex-none items-center justify-between bg-(--sheet) px-[30px] pt-1.5 text-(length:--ios-body) font-semibold tabular-nums">
			<span className="w-[62px] text-center">{time}</span>
			<span className="flex items-center gap-1.5">
				<Signal className="size-[18px]" strokeWidth={2.5} />
				<Wifi className="size-[18px]" strokeWidth={2.5} />
				<BatteryFull className="size-[26px]" strokeWidth={1.75} />
			</span>
		</div>
	);
}

function BrandBar() {
	return (
		<div className="flex h-14 flex-none items-center justify-between border-b border-(--rule) bg-(--sheet) px-4">
			<div className="flex items-center gap-3">
				<span className="grid size-11 place-items-center rounded-lg bg-(--accent-wash) text-base font-bold text-(--accent-ink)">
					R
				</span>
				<span className="text-(length:--ios-subhead) font-semibold tracking-tight">{BUSINESS}</span>
			</div>
			<span className="grid size-9 place-items-center rounded-lg text-(--ink-3)">
				<Moon className="size-[18px]" />
			</span>
		</div>
	);
}

function BackBar() {
	return (
		<div className="flex h-[52px] flex-none items-center justify-between border-b border-(--rule) px-6">
			<span className="flex items-center gap-1.5 text-(length:--ios-footnote) text-(--ink-3)">
				<ArrowLeft className="size-3.5" />
				Back
			</span>
			<span className="flex items-center gap-1.5 rounded-md border border-(--rule-2) bg-(--sheet) px-3 py-1.5 text-(length:--ios-footnote) font-medium">
				<Download className="size-3.5" />
				Download PDF
			</span>
		</div>
	);
}

function Eyebrow({ children, className }: { children: string; className?: string }) {
	return (
		<p className={cn("text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-3)", className)}>
			{children}
		</p>
	);
}

function PortalHome() {
	return (
		<>
			<div className="border-b border-(--rule) bg-(--sheet) px-6 pb-6 pt-7">
				<Eyebrow>Tuesday, October 6</Eyebrow>
				<p className="mt-1 text-(length:--portal-title) font-semibold leading-[1.1] tracking-[-0.02em]">Welcome back</p>
				<p className="mt-2 text-(length:--ios-subhead) leading-snug text-(--ink-3)">
					Here’s what’s happening with <span className="font-medium text-(--ink)">{BUSINESS}</span>.
				</p>
			</div>
			<div className="px-6 py-6">
				<section className="overflow-hidden rounded-lg border border-(--rule-2) bg-(--sheet)">
					<div className="flex items-center justify-between border-b border-(--rule) px-5 py-4">
						<div>
							<p className="text-(length:--ios-subhead) font-semibold">Recent activity</p>
							<p className="mt-0.5 text-(length:--ios-footnote) text-(--ink-3)">Latest from {BUSINESS}</p>
						</div>
						<span className="text-(length:--ios-footnote) font-medium text-(--accent-ink)">View all →</span>
					</div>
					<ul className="divide-y divide-(--rule)">
						{ACTIVITY.map(({ title, meta, time, icon: Icon, tint }) => (
							<li key={title} className="flex items-center gap-4 px-5 py-4">
								<span className={cn("grid size-9 flex-none place-items-center rounded-lg", tint)}>
									<Icon className="size-[18px]" />
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{title}</p>
									<p className="mt-0.5 truncate text-(length:--ios-footnote) text-(--ink-3)">{meta}</p>
								</div>
								<span className="text-(length:--ios-footnote) tabular-nums text-(--ink-3)">{time}</span>
							</li>
						))}
					</ul>
				</section>
			</div>
			<nav className="absolute inset-x-0 bottom-0 flex h-[90px] border-t border-(--rule) bg-(--sheet) pb-[34px]">
				{TABS.map(({ label, icon: Icon }, i) => (
					<span
						key={label}
						className={cn(
							"flex flex-1 flex-col items-center justify-center gap-0.5 text-xs",
							i === 0 ? "font-semibold text-(--accent-ink)" : "text-(--ink-3)",
						)}
					>
						<Icon className="size-5" />
						{label}
					</span>
				))}
			</nav>
		</>
	);
}

function QuoteView({
	approved,
	lines,
	totals,
	pressed,
}: {
	approved: boolean;
	lines: PhoneLine[];
	totals: Totals;
	pressed: string | null;
}) {
	return (
		<>
			<BackBar />
			<div className="flex flex-col gap-4 px-6 pt-5">
				<div className="rounded-xl border border-(--rule-2) bg-(--sheet) px-5 py-4">
					<div className="flex items-center gap-2">
						<StatusBadge status={approved ? "approved" : "sent"}>
							{approved ? "Accepted" : "Awaiting decision"}
						</StatusBadge>
						<span className="text-xs text-(--ink-3)">Sent Oct 6, 2026</span>
					</div>
					<p className="mt-2 text-xl font-semibold tracking-tight">Quote Q-001042 · Fall cleanup</p>
					<p className="mt-0.5 text-sm text-(--ink-3)">{BUSINESS}</p>
				</div>
				<div className="rounded-lg border border-(--rule-2) bg-(--sheet) px-5 pb-4 pt-2">
					<div className="flex border-b-2 border-(--ink) py-2.5 text-(length:--ios-footnote) font-semibold uppercase tracking-[0.06em] text-(--ink-3)">
						<span className="flex-1">Item</span>
						<span className="w-10 text-right">Qty</span>
						<span className="w-[92px] text-right">Total</span>
					</div>
					{lines.map((line) => (
						<div key={line.id} className="flex items-baseline border-b border-(--rule) py-2.5 last-of-type:border-b-0">
							<span className="flex-1 text-(length:--ios-subhead) font-semibold">{line.name}</span>
							<span className="w-10 text-right text-sm tabular-nums">1</span>
							<span className="w-[92px] text-right text-sm font-semibold tabular-nums">
								{formatCurrency(line.price)}
							</span>
						</div>
					))}
					<dl className="mt-1 flex flex-col items-end gap-1 border-t-2 border-(--ink) pt-3 text-(length:--ios-subhead)">
						<div className="flex gap-8">
							<dt className="text-(--ink-3)">Subtotal</dt>
							<dd className="tabular-nums">{formatCurrency(totals.subtotal)}</dd>
						</div>
						<div className="flex gap-8">
							<dt className="text-(--ink-3)">Estimated tax</dt>
							<dd className="tabular-nums">{formatCurrency(totals.tax)}</dd>
						</div>
						<div className="mt-1 flex gap-8 border-t border-(--ink) pt-2 text-(length:--ios-body) font-semibold">
							<dt>Total</dt>
							<dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
						</div>
					</dl>
				</div>
			</div>
			<div className="absolute inset-x-0 bottom-0 border-t border-(--rule) bg-(--sheet) px-4 pb-[34px] pt-3">
				{approved ? (
					<div className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--paid)_35%,transparent)] bg-(--paid-wash) p-4">
						<CheckCircle2 className="mt-0.5 size-5 flex-none text-(--paid)" />
						<div>
							<p className="text-lg font-semibold leading-tight">Quote approved</p>
							<p className="mt-1 text-sm">
								Signed by <span className="font-medium">Rachel Whitfield</span>
							</p>
							<p className="text-(length:--ios-footnote) text-(--ink-3)">Tue, Oct 6, 10:42 AM</p>
							<p className="mt-2 flex items-center gap-1.5 text-(length:--ios-footnote) font-medium text-(--accent-ink)">
								View approval receipt
								<ChevronDown className="size-3.5" />
							</p>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<Eyebrow className="tracking-[0.06em]">Quote total</Eyebrow>
							<p className="text-xl font-semibold tabular-nums">{formatCurrency(totals.total)}</p>
						</div>
						<div
							data-demo="approve"
							data-pressed={pressed === "approve"}
							className={cn(
								"flex items-center justify-center gap-2 rounded-lg bg-(--accent-ink) py-3 text-sm font-medium text-(--paper)",
								PRESSABLE,
							)}
						>
							<Check className="size-3.5" strokeWidth={2.5} />
							Approve quote
						</div>
					</div>
				)}
			</div>
		</>
	);
}

function Meta({ label, children }: { label: string; children: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-(length:--ios-caption) font-semibold uppercase tracking-[0.22em] text-(--ink-3)">{label}</span>
			<span className="text-(length:--ios-subhead) font-medium tabular-nums">{children}</span>
		</div>
	);
}

function InvoiceView({
	paid,
	lines,
	total,
	pressed,
}: {
	paid: boolean;
	lines: PhoneLine[];
	total: number;
	pressed: string | null;
}) {
	return (
		<>
			<BackBar />
			<div className="px-6 pt-5">
				<div className="flex flex-col gap-5 rounded-xl border border-(--rule-2) bg-(--sheet) p-5">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<span className="grid size-9 place-items-center rounded-md bg-(--accent-wash) text-sm font-bold text-(--accent-ink)">
								R
							</span>
							<span className="text-(length:--ios-subhead) font-semibold">{BUSINESS}</span>
						</div>
						<StatusBadge status={paid ? "paid" : "pending"}>{paid ? "Paid" : "Awaiting payment"}</StatusBadge>
					</div>
					<div className="flex flex-col gap-1.5">
						<Eyebrow className="tracking-[0.2em]">{paid ? "Total paid" : "Total due"}</Eyebrow>
						<p className="text-4xl font-bold leading-none tracking-tight tabular-nums">{formatCurrency(total)}</p>
						{paid ? <p className="text-xs text-(--ink-3)">on Oct 6, 2026</p> : null}
					</div>
					<div className="grid grid-cols-2 gap-4 border-y border-(--rule) py-5">
						<Meta label="Invoice">INV-002094</Meta>
						<Meta label="Issued">Oct 6, 2026</Meta>
						<Meta label="Due">Oct 6, 2026</Meta>
						<Meta label="Bill to">Rachel Whitfield</Meta>
					</div>
					{paid ? (
						<div className="rounded-lg border border-[color-mix(in_oklch,var(--paid)_35%,transparent)] bg-(--paid-wash) p-4">
							<div className="flex items-start gap-2">
								<CheckCircle2 className="mt-0.5 size-5 flex-none text-(--paid)" />
								<div>
									<p className="text-(length:--ios-subhead) font-semibold">Paid in full</p>
									<p className="mt-1 text-(length:--ios-footnote)">Thank you for your business with {BUSINESS}.</p>
								</div>
							</div>
							<div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[color-mix(in_oklch,var(--paid)_35%,transparent)] bg-(--sheet) p-3 text-(length:--ios-footnote)">
								<span className="tabular-nums">Payment · {formatCurrency(total)}</span>
								<span className="flex flex-none items-center gap-1 text-(--ink-3)">
									View receipt
									<ChevronDown className="size-3.5" />
								</span>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<div
								data-demo="pay"
								data-pressed={pressed === "pay"}
								className={cn(
									"flex items-center justify-center gap-2 rounded-lg bg-(--accent-ink) py-3 text-sm font-semibold text-(--paper) tabular-nums",
									PRESSABLE,
								)}
							>
								Pay {formatCurrency(total)}
								<Lock className="size-3.5" />
							</div>
							<p className="text-center text-(length:--ios-footnote) text-(--ink-3)">Secure payment powered by Stripe.</p>
						</div>
					)}
					<div className="border-t border-(--rule) pt-5">
						<div className="flex items-baseline justify-between">
							<Eyebrow className="tracking-[0.2em]">Line items</Eyebrow>
							<span className="text-xs text-(--ink-3)">{lines.length} items</span>
						</div>
						{lines.map((line) => (
							<div key={line.id} className="flex justify-between border-b border-(--rule) py-3 text-(length:--ios-subhead)">
								<span className="font-medium">{line.name}</span>
								<span className="tabular-nums">{formatCurrency(line.price)}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</>
	);
}

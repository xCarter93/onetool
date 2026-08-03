import type { CSSProperties, ReactNode } from "react";
import {
	ArrowUp,
	History,
	Loader2,
	MessageSquarePlus,
	Sparkles,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
	ANSWER_CHART,
	ANSWER_OVERDUE,
	ASK_CHART,
	ASK_OVERDUE,
	CHIP_INVOICES,
	CHIP_REPORT,
	PANEL,
	SPIN_CYCLES,
	T,
} from "./assistant-data";
import { ReportCard } from "./report-card";

/**
 * A faithful miniature of the floating assistant panel.
 *
 * The one thing that must survive the shrink is the ASYMMETRY: the user's
 * message is a right-aligned tinted bubble, and the assistant's answer has no
 * bubble at all — bare prose and bordered data cards on the panel background.
 * That asymmetry is the real product look; adding an assistant bubble would
 * make this a picture of a generic chat app.
 *
 * Server component. The only JavaScript in the whole scene is the <DrawIn>
 * observer in scene.tsx; every beat below is a CSS `--bp-delay`.
 */

/** Right-aligned, tinted, one corner tightened. Verbatim from the panel. */
function UserBubble({ children, delay }: { children: ReactNode; delay: number }) {
	return (
		<div
			className="bp-rise flex justify-end"
			style={{ "--bp-delay": `${delay}s` } as CSSProperties}
		>
			<p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 text-sm text-foreground">
				{children}
			</p>
		</div>
	);
}

/**
 * A tool chip resolving from running to done.
 *
 * CSS, not state: the done chip is stacked over the running one on an opaque
 * `bg-background` and fades in. That means the reduced-motion override and the
 * <noscript> floor both land it on the DONE state with no JavaScript and no
 * hydration flash, where a useState flip would paint the server's answer first
 * and then jump.
 *
 * The running chip is aria-hidden — a screen reader should hear the outcome,
 * not a superseded state.
 *
 * The spinner only turns once <DrawIn> flips `.bp-in`, and for a fixed number
 * of cycles. An `infinite` spinner would keep repainting forever underneath the
 * chip that covers it, which is both an idle cost and factually wrong: the tool
 * call has finished.
 */
function ToolChip({
	labels,
	delay,
	doneDelay,
	spinCycles,
}: {
	labels: { running: string; done: string };
	delay: number;
	doneDelay: number;
	spinCycles: number;
}) {
	const row = "flex items-center gap-1.5 text-xs text-muted-foreground";

	return (
		<div
			className="bp-rise"
			style={{ "--bp-delay": `${delay}s` } as CSSProperties}
		>
			<span className="grid w-fit">
				<span aria-hidden="true" className={cn("col-start-1 row-start-1", row)}>
					<Loader2
						aria-hidden="true"
						className="size-3 shrink-0 motion-safe:[.bp-in_&]:animate-spin"
						style={{ animationIterationCount: spinCycles }}
					/>
					{labels.running}
				</span>
				<span
					className={cn("bp-fade-in col-start-1 row-start-1 bg-background", row)}
					style={{ "--bp-delay": `${doneDelay}s` } as CSSProperties}
				>
					<Sparkles aria-hidden="true" className="size-3 shrink-0" />
					{labels.done}
				</span>
			</span>
		</div>
	);
}

/** Streamed answer: no bubble, no avatar, no chrome. */
function Answer({
	lead,
	rest,
	delay,
}: {
	lead: string;
	rest: string;
	delay: number;
}) {
	return (
		<p
			className="bp-rise text-sm leading-relaxed text-foreground"
			style={{ "--bp-delay": `${delay}s` } as CSSProperties}
		>
			<strong className="font-semibold">{lead}</strong>
			{rest}
		</p>
	);
}

export function AssistantPanel({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				// The floating surface is the one place in the app that carries a
				// heavy shadow — flow cards get shadow-sm, everything else a ring.
				// Keeping that hierarchy is what makes the miniature read as OneTool.
				"w-full max-w-[30rem] rounded-2xl border border-border bg-background shadow-2xl",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<div className="min-w-0">
					<p className="flex items-center gap-2 text-base font-semibold text-foreground">
						<Sparkles aria-hidden="true" className="size-4 text-primary" />
						{PANEL.title}
					</p>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{PANEL.subtitle}
					</p>
				</div>
				{/* Picture of the panel's controls, not controls: nothing here is
				    focusable or actionable, so it is decorative and stays out of the
				    tab order and the accessibility tree. */}
				<div
					aria-hidden="true"
					className="flex shrink-0 items-center gap-1 text-muted-foreground"
				>
					<History className="size-4" />
					<MessageSquarePlus className="size-4" />
					<X className="size-4" />
				</div>
			</div>

			<div className="flex flex-col gap-4 px-4 py-4">
				<UserBubble delay={T.ask[0]}>{ASK_CHART}</UserBubble>
				<ToolChip
					labels={CHIP_REPORT}
					delay={T.chip[0]}
					doneDelay={T.chipDone[0]}
					spinCycles={SPIN_CYCLES[0]}
				/>
				<ReportCard />
				<Answer
					lead={ANSWER_CHART.lead}
					rest={ANSWER_CHART.rest}
					delay={T.answer[0]}
				/>

				<UserBubble delay={T.ask[1]}>{ASK_OVERDUE}</UserBubble>
				<ToolChip
					labels={CHIP_INVOICES}
					delay={T.chip[1]}
					doneDelay={T.chipDone[1]}
					spinCycles={SPIN_CYCLES[1]}
				/>
				<Answer
					lead={ANSWER_OVERDUE.lead}
					rest={ANSWER_OVERDUE.rest}
					delay={T.answer[1]}
				/>
			</div>

			<div className="border-t border-border p-3">
				<div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 p-2">
					<span className="flex-1 p-1.5 text-sm text-muted-foreground">
						{PANEL.placeholder}
					</span>
					{/* The composer is empty, so the send affordance is in its real
					    disabled state — which is also why no white glyph ever sits on
					    the brand fill here. */}
					<span
						aria-hidden="true"
						className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground opacity-40"
					>
						<ArrowUp className="size-4" />
					</span>
				</div>
				<p className="mt-1.5 text-center text-[11px] text-muted-foreground">
					{PANEL.footnote}
				</p>
			</div>
		</div>
	);
}

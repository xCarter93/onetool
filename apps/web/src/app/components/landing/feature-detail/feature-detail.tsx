"use client";

import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	CreditCard,
	FileSignature,
	Globe,
	Mail,
	Map,
	Sparkles,
	Users,
	Workflow,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CtaButton } from "@/app/components/landing/cta-button";
import { SheetCode } from "../blueprint/sheet-frame";
import {
	CAPABILITY_CARDS,
	CAPABILITY_SUMMARY,
	type CapabilityCard,
	type CapabilityIcon,
} from "./feature-detail-data";

/**
 * A-502 — the capability sheet.
 *
 * Replaces the annotated system schematic that used to sit here (one diagram
 * carrying nine edges, three swimlanes and a leader read as busy rather than
 * legible). Same facts, sequential instead of simultaneous: a split sheet with
 * the claim on the left and the capabilities on a horizontal track on the right,
 * one card at a time. `system-schematic.tsx` is left on disk but unreferenced.
 *
 * HOUSING. The section declares its own padding and nothing else — the sheet
 * shell owns the container width, the seam rule and the corner marks.
 *
 * MOTION. None. The track is a native scroller and the only movement is the
 * browser's own; there are no motion imports, so nothing here depends on the
 * route's LazyMotion feature set.
 */

const SHEET = "A-502";
const SHEET_TITLE = "Capabilities";

/**
 * DRAFT copy. The clause is the old A-502 heading split into the template's
 * two-tone lines; the support sentence is the old mechanism line with the
 * diagram vocabulary (dashed runs, hand-offs) taken out.
 */
const HEADING = {
	lines: ["One workspace", "runs the whole job,"] as const,
	muted: "start to paid.",
	support:
		"Quote, signature, schedule, invoice, payment — each step hands off to the next on the same record, and the follow-ups run without you.",
	cta: "Start free",
	ctaHref: "/sign-up",
} as const;

const ICONS: Record<CapabilityIcon, LucideIcon> = {
	clients: Users,
	quotes: FileSignature,
	schedule: CalendarDays,
	routing: Map,
	invoices: CreditCard,
	portal: Globe,
	automations: Workflow,
	inbox: Mail,
	assistant: Sparkles,
};

export function FeatureDetail() {
	const trackRef = useRef<HTMLDivElement | null>(null);
	const [page, setPage] = useState(0);
	const [pageCount, setPageCount] = useState(1);

	/** One page = one card advance. Both the dots and the buttons use this step. */
	const step = useCallback((track: HTMLElement): number => {
		const card = track.querySelector<HTMLElement>("[data-card]");
		if (!card) return 0;
		const gap = parseFloat(getComputedStyle(track).columnGap || "0");
		return card.getBoundingClientRect().width + (Number.isFinite(gap) ? gap : 0);
	}, []);

	// Page count and current page are measured, never hard-coded: how many cards
	// fit is a function of the viewport, so the dots have to be derived.
	const recompute = useCallback((): void => {
		const track = trackRef.current;
		if (!track) return;
		const pitch = step(track);
		if (pitch <= 0) {
			setPage(0);
			setPageCount(1);
			return;
		}
		const scrollable = track.scrollWidth - track.clientWidth;
		// ceil, not round: a trailing partial page must still be reachable or the
		// Next button disables with the last card half clipped.
		const pages = Math.max(1, Math.ceil(scrollable / pitch) + 1);
		setPageCount(pages);
		setPage(Math.min(pages - 1, Math.max(0, Math.round(track.scrollLeft / pitch))));
	}, [step]);

	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const onScroll = (): void => recompute();
		track.addEventListener("scroll", onScroll, { passive: true });
		// observe() fires once immediately — that is the initial measurement.
		const observer = new ResizeObserver(() => recompute());
		observer.observe(track);
		return () => {
			track.removeEventListener("scroll", onScroll);
			observer.disconnect();
		};
	}, [recompute]);

	const scrollByCard = useCallback(
		(direction: 1 | -1): void => {
			const track = trackRef.current;
			if (!track) return;
			const pitch = step(track);
			if (pitch <= 0) return;
			const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches;
			track.scrollBy({
				left: direction * pitch,
				behavior: reduced ? "auto" : "smooth",
			});
		},
		[step],
	);

	return (
		<section
			id="features"
			className="bp-section relative isolate p-6 sm:p-10 lg:p-14"
		>
			<div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14">
				<div className="flex flex-col lg:justify-center">
					<SheetCode code={SHEET} label={SHEET_TITLE} />
					<h2 className="mt-5 text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]">
						{HEADING.lines.map((line) => (
							<span key={line} className="block">
								{line}
							</span>
						))}
						<span className="block text-muted-foreground">
							{HEADING.muted}
						</span>
					</h2>
					<p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
						{HEADING.support}
					</p>
					<div className="mt-8">
						<CtaButton href={HEADING.ctaHref}>{HEADING.cta}</CtaButton>
					</div>
				</div>

				<div className="flex min-w-0 flex-col">
					<p className="sr-only">{CAPABILITY_SUMMARY}</p>

					{/* Focusable so the scroller is reachable and pannable by keyboard —
					    the cards hold no interactive elements of their own. Margins are
					    ml/mr longhands, not mx: the track bleeds through the section's
					    right padding at every breakpoint so the last card scrolls fully
					    clear instead of clipping under the plate edge. */}
					<div
						ref={trackRef}
						tabIndex={0}
						role="group"
						aria-label="Capabilities"
						className="scrollbar-hide -ml-6 -mr-6 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pl-6 pr-6 scroll-pl-6 sm:-ml-10 sm:-mr-10 sm:pl-10 sm:pr-10 sm:scroll-pl-10 lg:ml-0 lg:-mr-14 lg:pl-0 lg:pr-14 lg:scroll-pl-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					>
						{CAPABILITY_CARDS.map((card) => (
							<Card key={card.id} card={card} />
						))}
					</div>

					<div className="mt-6 flex items-center gap-4">
						<TrackButton
							label="Previous capability"
							disabled={page === 0}
							onClick={() => scrollByCard(-1)}
						>
							<ChevronLeft className="h-4 w-4" aria-hidden="true" />
						</TrackButton>
						<TrackButton
							label="Next capability"
							disabled={page >= pageCount - 1}
							onClick={() => scrollByCard(1)}
						>
							<ChevronRight className="h-4 w-4" aria-hidden="true" />
						</TrackButton>

						{/* Ticks, not dots — the drafting register. Decorative: the page
						    position is already announced by the scroller itself. */}
						<div aria-hidden="true" className="flex items-center gap-1.5">
							{Array.from({ length: pageCount }).map((_, i) => (
								<span
									key={i}
									className={`h-3 w-px transition-colors duration-200 motion-reduce:transition-none ${
										i === page ? "bg-bp-ink" : "bg-bp-line-strong"
									}`}
								/>
							))}
						</div>

						<p className="ml-auto text-[10px] font-semibold uppercase leading-none tracking-[0.14em] tabular-nums text-muted-foreground">
							{`${String(page + 1).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

/**
 * A hairline plate in the pricing cards' vocabulary: frosted sky icon tile,
 * a brand top rule that inks in on hover, and the ref code demoted to a
 * bottom meta rule. Not clickable — there is nothing behind it.
 */
function Card({ card }: { card: CapabilityCard }) {
	const Icon = ICONS[card.icon];

	return (
		<article
			data-card
			className="group relative flex w-[18rem] shrink-0 snap-start flex-col border border-bp-line bg-bp-paper p-6 transition-colors duration-200 hover:border-primary/35 motion-reduce:transition-none sm:w-[20rem]"
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-transparent transition-colors duration-200 group-hover:bg-(--cta-solid) motion-reduce:transition-none"
			/>
			<span
				aria-hidden="true"
				className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-(--cta-solid) dark:text-primary"
			>
				<Icon className="h-4 w-4" strokeWidth={1.75} />
			</span>
			<h3 className="mt-6 text-lg font-semibold leading-tight tracking-tight text-foreground">
				{card.title}
			</h3>
			<p className="mb-6 mt-3 text-sm leading-relaxed text-muted-foreground">
				{card.body}
			</p>
			<div className="mt-auto border-t border-bp-line pt-4">
				<span className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] tabular-nums text-bp-anno">
					{card.refCode}
				</span>
			</div>
		</article>
	);
}

function TrackButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="inline-flex h-9 w-9 items-center justify-center border border-bp-line-strong text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-40 motion-reduce:transition-none"
		>
			{children}
		</button>
	);
}

export default FeatureDetail;

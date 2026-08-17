"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AmbientLayer } from "../ambient";
import { CompareHalftoneScene } from "../section-halftone-scenes";
import { Frame, FrameFooter, FrameHeader, FramePanel } from "@/components/reui/frame";
import {
	Eyebrow,
	Lede,
	PlusCorners,
	PlusMark,
	Section,
	SectionHeading,
} from "../primitives";
import {
	CREW_SIZES,
	DEFAULT_CREW,
	FEATURE_ROWS,
	FOOTNOTE_SOURCES,
	NON_CALCULATOR_MENTIONS,
	ONETOOL_MONTHLY,
	RETRIEVED_LABEL,
	VENDORS,
	cheapestRival,
	quoteFor,
	type CrewSize,
	type FeatureCell,
	type Vendor,
} from "./competitor-data";

/* Compare — the page's one big interactive, and the only section with no comp
 * line to copy, so it is built out of the comp's parts: a hairline ledger with
 * plus-corners on the elevated column, a dimension line under it, mono plan
 * labels. Every figure comes from competitor-data.ts with a sourceUrl; nothing
 * here is estimated. No red crosses, no mockery — competitors get quiet checks
 * and em dashes, and they keep the phone-support row. */

/** Value swaps fade rather than count. Reused keyframe from landing.css; the
 *  reduced-motion block there kills it with `animation: none !important`, and
 *  because the opacity only lives in the keyframe the cell then renders solid. */
const VALUE_FADE: CSSProperties = {
	animation: "lp-fade 260ms var(--lp-ease) both",
};

const people = (crew: number) => (crew === 1 ? "person" : "people");

function priceFor(v: Vendor, crew: number): string | null {
	const quote = quoteFor(v, crew);
	return quote ? formatCurrency(quote.monthly, { whole: true }) : null;
}

function planFor(v: Vendor, crew: number): string {
	const quote = quoteFor(v, crew);
	if (!quote) return "No published seat price";
	return `${quote.planName} · ${v.quotedBillingLabel}`;
}

function EmDash({ note = "Not published" }: { note?: string }) {
	return (
		<span className="text-(--ink-3)">
			<span aria-hidden="true">—</span>
			<span className="sr-only">{note}</span>
		</span>
	);
}

function FeatureValue({ cell, isUs }: { cell: FeatureCell; isUs: boolean }) {
	if (cell.kind === "unpublished") return <EmDash />;
	if (cell.kind === "soon") {
		// Not a check and not an em dash: a stated "not yet". Mono + the accent
		// rule reads as a dated note rather than a claim.
		return (
			<span className="inline-flex items-baseline gap-[7px] text-[13.5px] text-(--ink-3)">
				<span className="font-mono text-[11px] uppercase tracking-[0.06em] text-(--accent-ink)">
					Coming soon
				</span>
				{cell.label ? <span>{cell.label}</span> : null}
			</span>
		);
	}
	if (cell.kind === "tier") {
		return <span className="text-[13.5px] text-(--ink-3)">{cell.label}</span>;
	}
	if (cell.kind === "text") {
		return <span className="text-[13.5px] text-(--ink-2)">{cell.label}</span>;
	}
	return (
		<span className="inline-flex items-baseline gap-[7px] text-[13.5px] text-(--ink-2)">
			<span
				aria-hidden="true"
				className={cn("font-bold", isUs ? "text-(--paid)" : "text-(--ink-3)")}
			>
				✓
			</span>
			<span className="sr-only">Included.</span>
			{cell.label ? <span>{cell.label}</span> : null}
		</span>
	);
}

/* ------------------------------------------------------------------ stepper */

function CrewStepper({
	crew,
	onChange,
}: {
	crew: CrewSize;
	onChange: (crew: CrewSize) => void;
}) {
	return (
		<div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<span
				id="compare-crew-label"
				className="font-mono text-[11.5px] font-medium uppercase tracking-[0.06em] text-(--ink-3)"
			>
				Your crew
			</span>
			<div
				role="group"
				aria-labelledby="compare-crew-label"
				className="flex w-full max-w-[420px] overflow-hidden rounded-[11px] border border-(--rule-2) bg-(--sheet) sm:w-[380px]"
			>
				{CREW_SIZES.map((size) => {
					const selected = size === crew;
					return (
						<button
							key={size}
							type="button"
							aria-pressed={selected}
							onClick={() => onChange(size)}
							className={cn(
								// Outline (not ring) so the focus indicator draws inside
								// the control's overflow-hidden frame.
								// No min-width: flex-1/basis-0 keeps the columns equal, and
								// the min-content floor lets them shrink instead of clipping
								// out of the overflow-hidden frame on 320–360px phones.
								"min-h-[44px] flex-1 basis-0 cursor-pointer border-r border-(--rule) text-[15px] tabular-nums transition-colors last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink)",
								selected
									? "bg-(--accent-wash) font-semibold text-(--accent-ink) shadow-[inset_0_-2px_0_0_var(--accent)]"
									: "text-(--ink-2) hover:text-(--ink)",
							)}
						>
							{size}
							<span className="sr-only"> {people(size)}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* -------------------------------------------------------------- the readout */

function SavingsLine({ crew }: { crew: CrewSize }) {
	const rival = cheapestRival(crew);
	let line: string;

	if (!rival) {
		line = `No rival publishes a price for ${crew} ${people(crew)}.`;
	} else {
		const monthlyDelta = rival.monthly - ONETOOL_MONTHLY;
		const annualDelta = monthlyDelta * 12;
		if (monthlyDelta > 0) {
			line = `${formatCurrency(annualDelta, { whole: true })}/yr back vs ${rival.name} ${
				rival.planName
			} at ${crew} ${people(crew)}`;
		} else if (monthlyDelta < 0) {
			line = `${rival.name} ${rival.planName} is ${formatCurrency(-monthlyDelta, {
				whole: true,
			})}/mo less at ${crew} ${people(crew)} (the gap opens as the crew grows)`;
		} else {
			line = `Level with ${rival.name} ${rival.planName} at ${crew} ${people(crew)}`;
		}
	}

	return (
		<div className="flex items-center justify-center gap-1.5 text-(--rule-3)">
			<span aria-hidden="true" className="flex-none leading-none text-(--accent)">
				<PlusMark size={12} />
			</span>
			<span aria-hidden="true" className="hidden h-px flex-1 bg-current sm:block" />
			<p
				role="status"
				className="px-3 text-center font-mono text-[11.5px] leading-[1.5] tracking-[0.04em] text-(--ink-2)"
			>
				{line}
			</p>
			<span aria-hidden="true" className="hidden h-px flex-1 bg-current sm:block" />
			<span aria-hidden="true" className="flex-none leading-none text-(--accent)">
				<PlusMark size={12} />
			</span>
		</div>
	);
}

/* ---------------------------------------------------------- desktop ledger */

const ROW_LABEL =
	"border-t border-(--rule) px-5 py-[13px] text-left text-[14px] font-normal text-(--ink-2)";

const cellCls = (v: Vendor, extra?: string) =>
	cn("border-t border-(--rule) px-4 py-[13px]", v.isUs && "bg-(--accent-wash)", extra);

function LedgerTable({ crew }: { crew: CrewSize }) {
	return (
		<div className="hidden md:block">
			{/* Plain relative box: the section frame owns the border and the fill,
			    this only anchors the elevated column overlay. */}
			<div className="relative">
				<table className="w-full table-fixed border-collapse">
					<caption className="sr-only">
						Published monthly price and included features for a crew of {crew}{" "}
						{people(crew)}.
					</caption>
					{/* 28% + 4×18% = 100%. Both numbers are load-bearing: the elevated
					    OneTool overlay below is positioned off them, so they must move
					    together if a vendor is ever added or dropped. */}
					<colgroup>
						<col className="w-[28%]" />
						{VENDORS.map((v) => (
							<col key={v.key} className="w-[18%]" />
						))}
					</colgroup>
					<thead>
						<tr>
							{/* Corner cell heads the column of row labels — as a <td> it was
							    the one cell in the grid with no header association. */}
							<th
								scope="col"
								className="px-5 pb-3 pt-5 text-left align-bottom font-mono text-[11px] font-normal uppercase tracking-[0.1em] text-(--ink-3)"
							>
								Published rates
							</th>
							{VENDORS.map((v) => (
								<th
									key={v.key}
									scope="col"
									className={cn(
										"px-4 pb-3 pt-5 text-left align-bottom text-[15px] font-semibold tracking-[-0.01em]",
										v.isUs ? "bg-(--accent-wash) text-(--accent-ink)" : "text-(--ink-2)",
									)}
								>
									{v.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						<tr>
							<th scope="row" className={ROW_LABEL}>
								Monthly price for {crew} {people(crew)}
							</th>
							{VENDORS.map((v) => {
								const price = priceFor(v, crew);
								return (
									<td key={v.key} className={cellCls(v)}>
										{price ? (
											<span
												key={crew}
												style={VALUE_FADE}
												className="block text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-(--ink)"
											>
												{price}
												<span className="ml-[3px] text-[12px] font-medium tracking-normal text-(--ink-3)">
													/mo
												</span>
											</span>
										) : (
											<span className="block text-[22px]">
												<EmDash note="Not published for this crew size" />
											</span>
										)}
									</td>
								);
							})}
						</tr>

						<tr>
							<th scope="row" className={ROW_LABEL}>
								Plan used
							</th>
							{VENDORS.map((v) => (
								<td
									key={v.key}
									className={cellCls(
										v,
										"font-mono text-[11px] leading-[1.45] text-(--ink-3)",
									)}
								>
									<span key={crew} style={VALUE_FADE} className="block">
										{planFor(v, crew)}
									</span>
								</td>
							))}
						</tr>

						{FEATURE_ROWS.map((row) => (
							<tr key={row.label}>
								<th scope="row" className={ROW_LABEL}>
									{row.label}
								</th>
								{VENDORS.map((v) => (
									<td key={v.key} className={cellCls(v)}>
										<FeatureValue cell={row.cells[v.key]} isUs={v.isUs} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>

				{/* The elevated column: hairline sides + plus corners, pinned to the
				    OneTool column by the fixed colgroup widths (28% + 18%). */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-[28%] w-[18%] border-x border-(--rule-3)"
				>
					<PlusCorners />
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ mobile stack */

function VendorCard({ v, crew }: { v: Vendor; crew: CrewSize }) {
	const price = priceFor(v, crew);
	return (
		<article
			className={cn(
				"relative rounded-[14px] border bg-(--paper)",
				v.isUs ? "border-(--rule-3)" : "border-(--rule-2)",
			)}
		>
			{v.isUs ? <PlusCorners /> : null}
			<div
				className={cn(
					"flex items-baseline justify-between gap-3 rounded-t-[13px] border-b border-(--rule) px-4 py-3",
					v.isUs && "bg-(--accent-wash)",
				)}
			>
				<h3
					className={cn(
						"text-[15px] font-semibold tracking-[-0.01em]",
						v.isUs ? "text-(--accent-ink)" : "text-(--ink-2)",
					)}
				>
					{v.name}
				</h3>
			</div>

			<div className="px-4 py-4">
				{price ? (
					<p
						key={crew}
						style={VALUE_FADE}
						className="text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-(--ink)"
					>
						{price}
						<span className="ml-1 text-[13px] font-medium tracking-normal text-(--ink-3)">
							/mo for {crew} {people(crew)}
						</span>
					</p>
				) : (
					<p className="text-[26px] text-(--ink-3)">
						<EmDash note="Not published for this crew size" />
					</p>
				)}
				<p className="mt-1.5 font-mono text-[11px] text-(--ink-3)">{planFor(v, crew)}</p>
			</div>

			<dl className="px-4 pb-2">
				{FEATURE_ROWS.map((row) => (
					<div
						key={row.label}
						className="flex items-baseline justify-between gap-4 border-t border-(--rule) py-[11px]"
					>
						<dt className="text-[13.5px] text-(--ink-2)">{row.label}</dt>
						<dd className="text-right">
							<FeatureValue cell={row.cells[v.key]} isUs={v.isUs} />
						</dd>
					</div>
				))}
			</dl>
		</article>
	);
}

/* -------------------------------------------------------------------- notes */

function Footnotes() {
	const mention = NON_CALCULATOR_MENTIONS[0];
	const linked: ReactNode[] = [];
	FOOTNOTE_SOURCES.forEach((source, i) => {
		if (i > 0) linked.push(<span key={`sep-${source.name}`}>, </span>);
		linked.push(
			<a
				key={source.name}
				href={source.url}
				target="_blank"
				rel="noopener noreferrer"
				className="underline decoration-(--rule-3) underline-offset-2 transition-colors hover:text-(--ink-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
			>
				{source.name}
			</a>,
		);
	});

	return (
		<div className="grid gap-2 text-[12.5px] leading-[1.65] text-(--ink-2)">
			<p>
				<span aria-hidden="true">✓</span> included · a plan name means it is gated to that
				tier · &ldquo;coming soon&rdquo; means on the roadmap, not shipped yet ·{" "}
				<span aria-hidden="true">—</span> means the vendor does not publish it.
			</p>
			<p>
				{mention.name} {mention.note}, so there is no honest way to give it a column.
			</p>
			<p>
				Competitor prices are their published rates as of {RETRIEVED_LABEL} ({linked}).
				Every column, ours included, is the month-to-month rate — no annual commitment,
				and the price Jobber&rsquo;s page shows on load. Jobber&rsquo;s page prices by
				team size, so its column is the bucket Jobber itself puts that crew in.
			</p>
			{/* The row we lose, stated plainly. Jobber and Joby both publish the bare
          Stripe rate; we add $1 on top. Softening this is the fastest way to
          make the whole table untrustworthy. */}
			<p>
				On card processing we are the dearest of the three Stripe-based tools: Jobber and
				Joby both pass through the standard{" "}
				<span className="whitespace-nowrap">2.9% + 30¢</span> with nothing added, while
				OneTool charges {formatCurrency(1, { whole: true })} per transaction on top of
				your own Stripe rate. Housecall Pro runs its own processing from 2.59%.
			</p>
			{/* The concession that makes the monthly basis fair. Two of these four
          rivals are cheaper than their column if you commit to a year, and we
          name their numbers rather than leaving the reader to find the toggle.
          Do not cut this paragraph to shorten the footnote. */}
			<p>
				Committing to a year costs less at three of the five: Jobber from{" "}
				{formatCurrency(29, { whole: true })}/mo, Housecall Pro from{" "}
				{formatCurrency(59, { whole: true })}/mo, and OneTool at{" "}
				{formatCurrency(300, { whole: true })}/year. Joby publishes no annual rate. Every
				business is different, so check their sites for current pricing.
			</p>
		</div>
	);
}

/* --------------------------------------------------------------- the section */

export function Compare() {
	const [crew, setCrew] = useState<CrewSize>(DEFAULT_CREW);

	// Paper scheme, not sheet: Numbers above is already a sheet band, and the
	// ledger card is --sheet — it needs paper behind it to read as a card.
	// OnTheJob below is paper too, so this boundary needs the hairline seam.
	// overflow-hidden is the fullBleed ambient's clipping ancestor.
	return (
		<Section id="compare" divider className="overflow-hidden">
			{/* Halftone scene, drawing the section's own argument: one pickup and a
			    trailer on the left, the three-van yard on the right. The ledger is
			    opaque --sheet, so it still reads as a card over the field. */}
			<AmbientLayer fullBleed opacity={0.65}>
				<CompareHalftoneScene />
			</AmbientLayer>

			<div className="relative">
				<Eyebrow>Compare</Eyebrow>
				<SectionHeading>One price for the whole crew.</SectionHeading>
				<Lede className="max-w-[46rem]">
					Jobber reprices every plan as your team size grows, then adds $29 a month for
					each user past the bundled allowance. Housecall Pro&rsquo;s entry plan covers
					one person, and extra seats are sold only on its top plan. Joby prices flat with
					unlimited users like we do, and starts at $89. OneTool is one price for the
					whole company, however many of you there are.
				</Lede>

				{/* The workspace <Frame>, re-inked by the lp-frame bridge: picker in
				    the header, ledger in a flush panel, readout and sourcing notes in
				    the footer. Those notes used to sit bare on the halftone scene,
				    where 12px grey was close to unreadable. */}
				<Frame
					spacing="sm"
					className="lp-frame mt-[clamp(40px,6vw,80px)] w-full bg-(--paper)"
				>
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<CrewStepper crew={crew} onChange={setCrew} />
					</FrameHeader>

					<FramePanel className="p-0">
						<LedgerTable crew={crew} />

						<div className="grid gap-3 p-3 md:hidden">
							{VENDORS.map((v) => (
								<VendorCard key={v.key} v={v} crew={crew} />
							))}
						</div>

						<FrameFooter className="gap-4 border-t border-(--rule) bg-(--sheet) py-4">
							<SavingsLine crew={crew} />
							<Footnotes />
						</FrameFooter>
					</FramePanel>
				</Frame>
			</div>
		</Section>
	);
}

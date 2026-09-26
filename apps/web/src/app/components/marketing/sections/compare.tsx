"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Lede,
	Section,
	SectionHeading,
} from "../primitives";
import { AmbientLayer } from "../ambient";
import { CompareHalftoneScene } from "../section-halftone-scenes";
import { RoughMark } from "../rough-mark";
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

const VALUE_FADE: CSSProperties = {
	animation: "lp-fade 260ms var(--lp-ease) both",
};

const people = (crew: number) => (crew === 1 ? "person" : "people");

const DISCLOSURE_ROW_LABELS = new Set(["Card processing fee", "Phone support"]);
const DISCLOSURE_ROWS = FEATURE_ROWS.filter((r) => DISCLOSURE_ROW_LABELS.has(r.label));

function cellText(cell: FeatureCell): string {
	if (cell.kind === "included") return cell.label ?? "included";
	if (cell.kind === "soon") return "coming soon";
	if (cell.kind === "unpublished") return "not published";
	return cell.label;
}

function priceFor(v: Vendor, crew: number): string | null {
	const quote = quoteFor(v, crew);
	return quote ? formatCurrency(quote.monthly, { whole: true }) : null;
}

function planFor(v: Vendor, crew: number): string {
	const quote = quoteFor(v, crew);
	if (!quote) return "No published seat price";
	return `${quote.planName} · ${v.quotedBillingLabel}`;
}

function Unpublished({ note = "Not published" }: { note?: string }) {
	return (
		<span className="text-[12px] text-(--ink-3)">{note}</span>
	);
}

function FeatureValue({ cell, isUs }: { cell: FeatureCell; isUs: boolean }) {
	if (cell.kind === "unpublished") return <Unpublished />;
	if (cell.kind === "soon") {
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
								// Draw focus inside the clipped control frame.
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
			})}/mo less at ${crew} ${people(crew)}`;
		} else {
			line = `Level with ${rival.name} ${rival.planName} at ${crew} ${people(crew)}`;
		}
	}

	return (
		<div className="flex items-center justify-center gap-1.5 text-(--rule-3)">
			<span aria-hidden="true" className="hidden h-px flex-1 bg-current sm:block" />
			<p
				role="status"
				className="px-3 text-center font-mono text-[11.5px] leading-[1.5] tracking-[0.04em] text-(--ink-2)"
			>
				{line}
			</p>
			<span aria-hidden="true" className="hidden h-px flex-1 bg-current sm:block" />
		</div>
	);
}

const ROW_LABEL =
	"border-b border-(--rule) px-5 py-[13px] text-left text-[14px] font-normal text-(--ink-2)";

const US_COLUMN = "border-l border-l-(--rule-3) bg-(--accent-wash)";

const cellCls = (v: Vendor, extra?: string) =>
	cn("border-b border-(--rule) px-4 py-[13px]", v.isUs && US_COLUMN, extra);

const HEAD_CELL =
	"border-b border-(--rule) px-4 pb-3 pt-5 text-left align-bottom text-[11px] font-semibold uppercase tracking-[0.08em] text-(--ink-3)";

function LedgerTable({ crew }: { crew: CrewSize }) {
	return (
		<table className="hidden w-full table-fixed border-collapse md:table">
			<caption className="sr-only">
				Published monthly price and included features for a crew of {crew}{" "}
				{people(crew)}.
			</caption>
			<colgroup>
				<col className="w-[28%]" />
				{VENDORS.map((v) => (
					<col key={v.key} className="w-[18%]" />
				))}
			</colgroup>
			<thead>
				<tr>
					<th scope="col" className={cn(HEAD_CELL, "px-5")}>
						Published rates
					</th>
					{VENDORS.map((v) => (
						<th key={v.key} scope="col" className={cn(HEAD_CELL, v.isUs && US_COLUMN)}>
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
										<Unpublished note="Not published" />
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
	);
}

function VendorCard({ v, crew }: { v: Vendor; crew: CrewSize }) {
	const price = priceFor(v, crew);
	return (
		<article
			className={cn(
				"relative rounded-[14px] border px-4 py-4",
				v.isUs ? "border-(--rule-3) bg-(--accent-wash)" : "border-(--rule-2) bg-(--paper)",
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
			{price ? (
				<p
					key={crew}
					style={VALUE_FADE}
					className="mt-2 text-[26px] font-semibold tabular-nums tracking-[-0.025em] text-(--ink)"
				>
					{price}
					<span className="ml-1 text-[13px] font-medium tracking-normal text-(--ink-3)">
						/mo for {crew} {people(crew)}
					</span>
				</p>
			) : (
				<p className="mt-2 text-[26px] text-(--ink-3)">
					<Unpublished note="Not published" />
				</p>
			)}
			<p className="mt-1.5 font-mono text-[11px] text-(--ink-3)">{planFor(v, crew)}</p>
		</article>
	);
}

function Legend() {
	return (
		<p className="hidden text-[12.5px] leading-[1.65] text-(--ink-2) md:block">
			<span aria-hidden="true">✓</span> included. A plan name means the feature needs that
			tier. &ldquo;Coming soon&rdquo; means it is on the roadmap.
		</p>
	);
}

function HowWePriced() {
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
				className="underline decoration-(--rule-3) underline-offset-2 transition-colors hover:text-(--ink) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
			>
				{source.name}
			</a>,
		);
	});

	return (
		<Collapsible>
			<CollapsibleTrigger className="group inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 text-[13.5px] font-medium text-(--ink) underline decoration-(--rule-3) underline-offset-4 transition-colors hover:decoration-(--ink-3) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)">
				How we priced this
				<ChevronDown
					aria-hidden="true"
					className="size-4 text-(--ink-3) transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="grid max-w-[46rem] gap-2 pt-2 text-[12.5px] leading-[1.65] text-(--ink-2)">
				<p>
					{mention.name} {mention.note}, so there is no honest way to give it a column.
				</p>
				<p>
					Sources: {linked}. Every column, ours included, is the month-to-month rate with no
					annual commitment, and the price Jobber&rsquo;s page shows on load. Jobber&rsquo;s
					page prices by team size, so its column is the bucket Jobber itself puts that
					crew in.
				</p>
				<p>
					On card processing we are the dearest of the three Stripe-based tools: Jobber and
					Joby both pass through the standard{" "}
					<span className="whitespace-nowrap">2.9% + 30¢</span> with nothing added, while
					OneTool charges {formatCurrency(1, { whole: true })} per transaction on top of
					your own Stripe rate. Housecall Pro runs its own processing from 2.59%.
				</p>
				<p>
					Committing to a year costs less at three of the five: Jobber from{" "}
					{formatCurrency(29, { whole: true })}/mo, Housecall Pro from{" "}
					{formatCurrency(59, { whole: true })}/mo, and OneTool at{" "}
					{formatCurrency(300, { whole: true })}/year. Joby publishes no annual rate. Every
					business is different, so check their sites for current pricing.
				</p>
				{DISCLOSURE_ROWS.map((row) => (
					<p key={row.label}>
						{row.label}.{" "}
						{VENDORS.map((v) => `${v.name}: ${cellText(row.cells[v.key])}`).join(" · ")}.
					</p>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function Compare() {
	const [crew, setCrew] = useState<CrewSize>(DEFAULT_CREW);

	return (
		<Section id="compare" divider className="overflow-hidden">
			<AmbientLayer fullBleed opacity={0.65}>
				<CompareHalftoneScene />
			</AmbientLayer>

			<SectionHeading className="mt-0">
				<RoughMark type="highlight">One price</RoughMark> for the whole crew.
			</SectionHeading>
			<Lede className="max-w-[46rem]">
				See how published monthly prices change as your crew grows. OneTool&apos;s
				Business price stays flat through 20 seats.
			</Lede>

			<div className="mt-[clamp(40px,6vw,80px)] grid gap-6">
				<CrewStepper crew={crew} onChange={setCrew} />

				<LedgerTable crew={crew} />

				<div className="grid gap-3 md:hidden">
					{VENDORS.map((v) => (
						<VendorCard key={v.key} v={v} crew={crew} />
					))}
				</div>

				<SavingsLine crew={crew} />

				<div className="grid gap-1">
					<Legend />
					<p className="text-[12.5px] leading-[1.65] text-(--ink-2)">
						Competitor prices are their published month-to-month rates as of{" "}
						{RETRIEVED_LABEL}.
					</p>
					<HowWePriced />
				</div>
			</div>
		</Section>
	);
}

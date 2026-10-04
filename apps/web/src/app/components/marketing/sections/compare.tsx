"use client";

import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { formatCurrency } from "@/lib/money";
import { BUSINESS_MONTHLY_USD } from "@/lib/plan-pricing";
import { cn } from "@/lib/utils";
import { Lede, Section, SectionHeading } from "../primitives";
import {
	CREW_SIZES,
	DEFAULT_CREW,
	FEATURE_ROWS,
	VENDORS,
	cheapestRival,
	quoteFor,
	vendor,
	type CrewSize,
	type FeatureCell,
	type Vendor,
} from "./competitor-data";
import { useRevealOnce } from "../use-reveal-once";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CompareChart } from "./compare-chart";

const PEOPLE = { one: "person", other: "people" } as const;
const pluralRules = new Intl.PluralRules("en-US");
const people = (crew: number) =>
	pluralRules.select(crew) === "one" ? PEOPLE.one : PEOPLE.other;

const RIVALS = VENDORS.filter((v) => !v.isUs);

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
		<span className="text-xs text-(--ink-3)">{note}</span>
	);
}

// Plan order per vendor is the order plans first appear in its price list.
function tierRank(v: Vendor, planName: string): number {
	return [...new Set(v.plans.map((p) => p.name))].indexOf(planName);
}

/** A "needs tier X" cell counts as included when the plan quoted for this crew size is X or higher. */
function tierIncluded(v: Vendor, crew: CrewSize, cell: FeatureCell): boolean {
	if (cell.kind !== "tier") return false;
	const quote = quoteFor(v, crew);
	if (!quote) return false;
	const needed = tierRank(v, cell.label.replace(/ plan$/, ""));
	return needed >= 0 && tierRank(v, quote.planName) >= needed;
}

function FeatureValue({ cell, v, crew, index }: { cell: FeatureCell; v: Vendor; crew: CrewSize; index: number }) {
	const isUs = v.isUs;
	if (cell.kind === "unpublished") return <Unpublished />;
	if (cell.kind === "soon") {
		return (
			<span className="inline-flex items-baseline gap-[7px] text-sm text-(--ink-3)">
				<span className="text-2xs font-semibold uppercase tracking-[0.08em] text-(--accent-ink)">
					Coming soon
				</span>
				{cell.label ? <span>{cell.label}</span> : null}
			</span>
		);
	}
	if (cell.kind === "tier" && !tierIncluded(v, crew, cell)) {
		return <span className="text-sm text-(--ink-3)">{cell.label}</span>;
	}
	if (cell.kind === "text") {
		return <span className="text-sm text-(--ink-2)">{cell.label}</span>;
	}
	return (
		<span className="inline-flex items-start gap-[7px] text-sm text-(--ink-2)">
			<span
				aria-hidden="true"
				className={cn("flex h-5 flex-none items-center", isUs ? "lp-check text-(--paid)" : "text-(--ink-3)")}
				style={isUs ? ({ "--i": index } as CSSProperties) : undefined}
			>
				<Check strokeWidth={2.5} className="size-3.5" />
			</span>
			<span className="sr-only">Included.</span>
			{cell.kind === "tier" ? <span>on {cell.label}</span> : cell.label ? <span>{cell.label}</span> : null}
		</span>
	);
}

const SEGMENT_GROUP = "flex w-full overflow-hidden rounded-xl border border-(--rule-2) bg-(--sheet)";
// Draw focus inside the clipped control frame.
const SEGMENT =
	"min-h-[44px] flex-1 basis-0 cursor-pointer border-r border-(--rule) text-base transition-colors last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent-ink)";
const SEGMENT_ON = "bg-(--accent-wash) font-semibold text-(--accent-ink) shadow-[inset_0_-2px_0_0_var(--accent)]";
const SEGMENT_OFF = "text-(--ink-2) hover:text-(--ink)";

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
				className="text-sm font-medium text-(--ink-2)"
			>
				Your crew
			</span>
			<div
				role="group"
				aria-labelledby="compare-crew-label"
				className={cn(SEGMENT_GROUP, "max-w-[420px] sm:w-[380px]")}
			>
				{CREW_SIZES.map((size) => {
					const selected = size === crew;
					return (
						<button
							key={size}
							type="button"
							aria-pressed={selected}
							onClick={() => onChange(size)}
							className={cn(SEGMENT, "tabular-nums", selected ? SEGMENT_ON : SEGMENT_OFF)}
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

function SavingsLine({ crew, rival }: { crew: CrewSize; rival: Vendor }) {
	const quote = quoteFor(rival, crew);
	const forCrew = `for ${crew} ${people(crew)}`;
	let line: ReactNode;

	if (!quote) {
		line = `${rival.name} publishes no price ${forCrew}.`;
	} else {
		const monthlyDelta = quote.monthly - BUSINESS_MONTHLY_USD;
		const rivalPlan = `${rival.name} ${quote.planName}`;
		if (monthlyDelta > 0) {
			line = (
				<>
					Save{" "}
					<span className="tabular-nums text-(--paid)">
						{formatCurrency(monthlyDelta * 12, { whole: true })}
					</span>{" "}
					a year in subscription fees compared with {rivalPlan} {forCrew}.{" "}
					<span className="text-base font-normal text-(--ink-2)">
						Card payments carry {formatCurrency(1, { whole: true })} per transaction on top of your Stripe rate.
					</span>
				</>
			);
		} else if (monthlyDelta < 0) {
			line = (
				<>
					{rivalPlan} costs{" "}
					<span className="tabular-nums">
						{formatCurrency(-monthlyDelta, { whole: true })}
					</span>{" "}
					a month less {forCrew}.
				</>
			);
		} else {
			line = `OneTool and ${rivalPlan} cost the same ${forCrew}.`;
		}
	}

	return (
		<p
			role="status"
			className="max-w-[46rem] text-lg font-semibold leading-[1.35] tracking-[-0.015em] text-(--ink) sm:text-xl"
		>
			{line}
		</p>
	);
}

const ROW_LABEL = "border-b border-(--rule) px-3 py-[13px] text-left text-sm font-normal text-(--ink-2) md:px-5";

const US_COLUMN = "border-l border-l-(--rule-3) bg-(--accent-wash)";

function Cell({ v, className, children }: { v: Vendor; className?: string; children: ReactNode }) {
	return (
		<td className={cn("border-b border-(--rule) px-3 py-[13px] md:px-4", v.isUs && US_COLUMN, className)}>
			{children}
		</td>
	);
}

const HEAD_CELL =
	"border-b border-(--rule) px-3 pb-3 pt-5 md:px-4 text-left align-bottom text-2xs font-semibold uppercase tracking-[0.08em] text-(--ink-3)";

function ShortValue({ cell, v, crew }: { cell: FeatureCell; v: Vendor; crew: CrewSize }) {
	if (cell.kind === "unpublished") return <span className="text-(--ink-3)">Not published</span>;
	if (cell.kind === "soon") return <span className="text-(--ink-3)">Coming soon</span>;
	if (cell.kind === "tier" && !tierIncluded(v, crew, cell)) {
		return <span className="text-(--ink-3)">{cell.label.replace(/ plan$/, "")} plan</span>;
	}
	if (cell.kind === "text") return <span>{cell.short ?? cell.label}</span>;
	const note = cell.kind === "tier" ? `on ${cell.label.replace(/ plan$/, "")}` : (cell.short ?? cell.label);
	return (
		<span className="inline-flex flex-col items-center gap-0.5">
			<Check aria-hidden="true" className="size-4 text-(--paid)" strokeWidth={2.5} />
			<span className="sr-only">Included</span>
			{note ? <span>{note}</span> : null}
		</span>
	);
}

/** Phones: every vendor at once, label above its four cells, so nothing hides behind a picker and the text stays readable. */
function DifferencesGrid({ crew }: { crew: CrewSize }) {
	return (
		<table className="w-full table-fixed border-separate border-spacing-0">
			<caption className="sr-only">Included features by vendor for a crew of {crew}.</caption>
			<thead className="sticky top-16 z-10 bg-(--sheet)">
				<tr>
					{VENDORS.map((v) => (
						<th key={v.key} id={`cmp-v-${v.key}`} scope="col" className={cn(HEAD_CELL, "px-1 text-center tracking-[0.04em]", v.isUs && US_COLUMN)}>
							{v.name}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{FEATURE_ROWS.map((row, i) => (
					<Fragment key={row.label}>
						<tr>
							{/* The label sits in its own row, so cells name it and the vendor by id instead of relying on scope. */}
							<th id={`cmp-f-${i}`} colSpan={VENDORS.length} className="px-1 pb-1 pt-4 text-left text-sm font-medium text-(--ink)">
								{row.label}
							</th>
						</tr>
						<tr>
							{VENDORS.map((v) => (
								<td
									key={v.key}
									headers={`cmp-f-${i} cmp-v-${v.key}`}
									className={cn(
										"border-b border-(--rule) px-1 pb-3 pt-1 text-center align-top text-[13px] leading-[1.35] text-(--ink-2)",
										v.isUs && US_COLUMN,
									)}
								>
									<ShortValue cell={row.cells[v.key]} v={v} crew={crew} />
								</td>
							))}
						</tr>
					</Fragment>
				))}
			</tbody>
		</table>
	);
}

function LedgerTable({ crew, vendors }: { crew: CrewSize; vendors: Vendor[] }) {
	const ref = useRef<HTMLDivElement>(null);
	useRevealOnce(ref);
	const labelWidth = vendors.length > 2 ? "28%" : "40%";
	const columnWidth = `${(100 - parseFloat(labelWidth)) / vendors.length}%`;

	return (
		<div ref={ref}>
			<table className="w-full table-fixed border-separate border-spacing-0">
				<caption className="sr-only">
					Published monthly price and included features for a crew of {crew}{" "}
					{people(crew)}: {vendors.map((v) => v.name).join(", ")}.
				</caption>
				<colgroup>
					<col style={{ width: labelWidth }} />
					{vendors.map((v) => (
						<col key={v.key} style={{ width: columnWidth }} />
					))}
				</colgroup>
				<thead>
					<tr>
						<th scope="col" className={cn(HEAD_CELL, "md:px-5")}>
							Published rates
						</th>
						{vendors.map((v) => (
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
						{vendors.map((v) => {
							const price = priceFor(v, crew);
							return (
								<Cell key={v.key} v={v}>
									{price ? (
										<span
											key={crew}
											className="block text-xl font-semibold tabular-nums tracking-[-0.02em] text-(--ink)"
										>
											{price}
											<span className="ml-[3px] text-xs font-medium tracking-normal text-(--ink-3)">
												/mo
											</span>
										</span>
									) : (
										<span className="block text-xl">
											<Unpublished note="Not published" />
										</span>
									)}
								</Cell>
							);
						})}
					</tr>

					<tr>
						<th scope="row" className={ROW_LABEL}>
							Plan used
						</th>
						{vendors.map((v) => (
							<Cell key={v.key} v={v} className="text-xs leading-[1.45] text-(--ink-3)">
								<span key={crew} className="block">
									{planFor(v, crew)}
								</span>
							</Cell>
						))}
					</tr>

					{FEATURE_ROWS.map((row, i) => (
						<tr key={row.label}>
							<th scope="row" className={ROW_LABEL}>
								{row.label}
							</th>
							{vendors.map((v) => (
								<Cell key={v.key} v={v}>
									<FeatureValue cell={row.cells[v.key]} v={v} crew={crew} index={i} />
								</Cell>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Legend() {
	return (
		<p className="text-xs leading-[1.65] text-(--ink-2)">
			<Check aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" /> included on the plan quoted for this crew size. A plan name means it needs that
			higher tier. &ldquo;Coming soon&rdquo; means it is on the roadmap.
		</p>
	);
}

export function Compare() {
	const [crew, setCrew] = useState<CrewSize>(DEFAULT_CREW);
	const cheapest = cheapestRival(crew);
	const cheapestVendor = cheapest ? vendor(cheapest.key) : RIVALS[0];
	// Server HTML carries both layouts (CSS picks one); after hydration only the matching one stays in the DOM.
	const narrow = useMediaQuery("(max-width: 767px)");

	return (
		<Section id="compare" scheme="sheet">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<SectionHeading className="mt-0 max-w-[16ch]">
					What the same crew costs elsewhere.
				</SectionHeading>
				<Lede className="mt-0 max-w-[30rem]">
					See how published monthly prices change as your crew grows. OneTool&rsquo;s
					Business price stays flat through 20 seats.
				</Lede>
			</div>

			<div className="mt-[clamp(40px,6vw,80px)] grid gap-6">
				<CrewStepper crew={crew} onChange={setCrew} />

				{narrow !== false && (
				<div className="grid gap-6 md:hidden">
					<CompareChart crew={crew} width={300} height={220} />
					<DifferencesGrid crew={crew} />
					<SavingsLine crew={crew} rival={cheapestVendor} />
				</div>
				)}
				{narrow !== true && (
				<div className="hidden md:grid md:gap-6">
					<CompareChart crew={crew} width={1200} height={420} />
					<LedgerTable crew={crew} vendors={VENDORS} />
					<SavingsLine crew={crew} rival={cheapestVendor} />
				</div>
				)}

				<Legend />
			</div>
		</Section>
	);
}

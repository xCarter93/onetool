"use client";

import { Sparkles } from "lucide-react";
import MagicTransform, {
	type MagicTransformDocument,
	type MagicTransformResult,
} from "@/components/react-bits/magic-transform";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* Switching over — the spreadsheet actually moves. Sheets of the old export
 * slide through the AI-import axis on the left and come out the right as named
 * client records. The cards use MagicTransform's `sheet` artwork (ruled cells
 * under a header band) rather than its default letter/photo pages: this section
 * is about a CSV, and generic documents did not say that. Reduced motion pauses
 * the loop on its settled frame, so the story still reads as a still. The
 * module is a client component only because the transformer and the motion
 * query need the browser. */

/* Paper-and-ink chips: pale tint plus ink text, never a saturated slab.
 * --accent-ink resolved to hex because MagicTransform concatenates alpha
 * suffixes onto the axis colour, which a CSS custom property can't carry. */
const ACCENT_INK = "#0b7cba";

const DOCUMENTS: MagicTransformDocument[] = [
	{ id: "csv-rows-1", variant: "sheet" },
	{ id: "csv-rows-2", variant: "sheet" },
	{ id: "csv-rows-3", variant: "sheet" },
	{ id: "csv-rows-4", variant: "sheet" },
];

const RESULTS: MagicTransformResult[] = [
	{
		id: "whitfield",
		label: "Whitfield Property Group · matched",
		color: "#e3f2e9",
		textColor: "#155f43",
	},
	{
		id: "alvarez",
		label: "R. Alvarez · new client",
		color: "#e4f2fb",
		textColor: ACCENT_INK,
	},
	{
		id: "northgate",
		label: "Northgate HOA · new client",
		color: "#e4f2fb",
		textColor: ACCENT_INK,
	},
	{
		id: "kerr",
		label: "Kerr Rd Maintenance · matched",
		color: "#e3f2e9",
		textColor: "#155f43",
	},
];

export function Switching() {
	const reduced = usePrefersReducedMotion();

	return (
		<Section
			id="switching"
			pad="tight"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-[clamp(28px,4vw,56px)]"
		>
			<div>
				<Eyebrow>Switching over</Eyebrow>
				<SectionHeading size="sm">Bring the list you already have.</SectionHeading>
				<Lede className="max-w-[30rem]">
					Export a CSV from whatever you use today, even the spreadsheet on the
					office laptop. OneTool reads it, works out which column is which, and
					matches names to clients you already have.
				</Lede>
			</div>

			<div className="overflow-hidden rounded-2xl border border-(--rule-2) bg-(--paper)">
				<div
					role="img"
					aria-label="Rows of a spreadsheet export passing through OneTool's AI import and coming out as named client records: Whitfield Property Group matched, R. Alvarez new client, Northgate HOA new client, Kerr Rd Maintenance matched."
				>
					<MagicTransform
						documents={DOCUMENTS}
						results={RESULTS}
						paused={reduced}
						height={400}
						documentWidth={178}
						documentHeight={112}
						documentGap={22}
						documentDuration={3.4}
						centerSize={52}
						particleCount={14}
						axisColor={ACCENT_INK}
						centerContent={
							<Sparkles
								aria-hidden="true"
								className="size-[22px] text-(--accent-ink)"
								strokeWidth={1.6}
							/>
						}
						classNames={{ root: "rounded-none" }}
					/>
				</div>
				<p className="border-t border-(--rule) px-[18px] py-[12px] text-[12px] text-(--ink-3)">
					214 rows read · 4 shown
				</p>
			</div>
		</Section>
	);
}

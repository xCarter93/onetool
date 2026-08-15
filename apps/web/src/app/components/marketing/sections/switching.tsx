"use client";

import { Sparkles } from "lucide-react";
import MagicTransform, {
	type MagicTransformResult,
} from "@/components/react-bits/magic-transform";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/* Switching over — the spreadsheet actually moves. Rows of the old export slide
 * through the AI-import axis on the left and come out the right as named client
 * records. Reduced motion pauses the loop on its settled frame, so the story
 * still reads as a still. The module is a client component only because the
 * transformer and the motion query need the browser. */

/* Paper-and-ink chips: pale tint plus ink text, never a saturated slab.
 * --accent-ink resolved to hex because MagicTransform concatenates alpha
 * suffixes onto the axis colour, which a CSS custom property can't carry. */
const ACCENT_INK = "#0b7cba";

const DOCUMENTS = [
	{ id: "csv-row-1" },
	{ id: "csv-row-2" },
	{ id: "csv-row-3" },
	{ id: "csv-row-4" },
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
					Export a CSV from whatever you&rsquo;re using — or the spreadsheet on the
					office laptop — and OneTool reads it, works out which column is which, and
					matches names to clients you already have.
				</Lede>
			</div>

			<div className="overflow-hidden rounded-2xl border border-(--rule-2) bg-(--paper)">
				<div
					role="img"
					aria-label="Rows of a spreadsheet export passing through OneTool's AI import and coming out as named client records — Whitfield Property Group matched, R. Alvarez new client, Northgate HOA new client, Kerr Rd Maintenance matched."
				>
					<MagicTransform
						documents={DOCUMENTS}
						results={RESULTS}
						paused={reduced}
						height={400}
						documentWidth={168}
						documentHeight={104}
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

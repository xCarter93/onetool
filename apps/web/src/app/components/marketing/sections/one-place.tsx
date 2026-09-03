import { AmbientLayer } from "../ambient";
import { OldWayStack } from "../old-way-stack";
import { OldWayHalftoneScene } from "../section-halftone-scenes";
import {
	Eyebrow,
	GridBackdrop,
	Lede,
	PlusCorners,
	Section,
	SectionHeading,
} from "../primitives";

/* THE OLD WAY — dark band. Re-inked by `lp-scheme-dark` (Section scheme="dark"),
 * so this reads identically in light and dark: tokens only, no theme branches. */

/** The five places a job currently lives, with what each one actually gives you. */
const REPLACES = [
	{ label: "Email", note: "Three replies deep for a gate code" },
	{ label: "Spreadsheet", note: "Last updated… Tuesday? By someone?" },
	{ label: "Notebook", note: "In the truck. With the truck." },
	{ label: "Group text", note: "“who's taking Kerr Road?”" },
	{ label: "Sticky note", note: "$180 owed, stuck to the dashboard" },
] as const;

const RECORD_CHIPS = [
	"Contacts",
	"Property",
	"Quote",
	"Signature",
	"Visits",
	"Photos",
	"Invoice",
	"Payment",
] as const;

export function OnePlace() {
	return (
		<Section id="one-place" scheme="dark" className="overflow-hidden">
			{/* Halftone scene: a flat yard stacked with things of clashing heights,
			    the section's argument as a skyline. Both corners, no diagonal mask —
			    the copy column clears the field's top edge on its own, and masking
			    the left half away left a third of the band empty. Blue reads much
			    weaker on this dark paper than on light, hence the high opacity;
			    `--accent` is not re-inked by .lp-scheme-dark. */}
			<AmbientLayer opacity={0.8} fullBleed>
				<OldWayHalftoneScene />
			</AmbientLayer>

			{/* Full-bleed construction grid: the wrapper escapes the 1560px container,
			    the section's overflow-hidden clips it back to the band. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
			>
				<GridBackdrop
					size={48}
					opacity={0.45}
					mask="radial-gradient(90% 70% at 22% 30%, #000 0%, transparent 72%)"
				/>
			</div>

			<div className="relative grid items-start gap-[clamp(32px,5vw,80px)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]">
				<div>
					<Eyebrow>The old way</Eyebrow>
					<SectionHeading>
						Five places to look.{" "}
						<span className="text-(--accent-ink)">One job</span> to do.
					</SectionHeading>
					<Lede className="max-w-[34rem]">
						Email, a spreadsheet, a notebook, the group text and a sticky note
						on the dash. A different hat for each one: dispatcher, bookkeeper,
						scheduler, collections. None of them know about each other, so you
						become the integration.
					</Lede>

					<div className="mt-[clamp(40px,6vw,80px)] grid max-w-[30rem] gap-[22px]">
						<div className="border-t border-dashed border-(--rule-2) pt-[18px]">
							<h3 className="text-[19px] font-medium leading-[1.35] tracking-[-0.02em]">
								The address exists in five handwritings
							</h3>
							<p className="mt-2 text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
								It&apos;s in the thread, on the quote, in the notebook and on
								the sticky note. Four of them are out of date and you find out
								which on the driveway.
							</p>
						</div>
						<div className="border-t border-dashed border-(--rule-2) pt-[18px]">
							<h3 className="text-[19px] font-medium leading-[1.35] tracking-[-0.02em]">
								A spreadsheet only knows what you typed into it
							</h3>
							<p className="mt-2 text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
								It can&apos;t tell you the quote came back signed, that the
								invoice went out, or that nobody has paid it. It waits for you,
								usually at nine in the evening.
							</p>
						</div>
					</div>
				</div>

				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--ink-3)">
						What it replaces
					</p>
					<ul className="mt-[14px]">
						{REPLACES.map(({ label, note }, i) => (
							<li
								key={label}
								className={
									i === REPLACES.length - 1
										? "flex items-baseline gap-4 border-t border-b border-dashed border-(--rule-2) py-[13px]"
										: "flex items-baseline gap-4 border-t border-dashed border-(--rule-2) py-[13px]"
								}
							>
								<span className="w-24 flex-none font-mono text-[11px] uppercase tracking-[0.1em] text-(--ink-3)">
									{label}
								</span>
								<span className="text-[15px] leading-[1.5] text-(--ink-2) text-pretty">
									{note}
								</span>
							</li>
						))}
					</ul>

					<OldWayStack />

					<div className="relative mt-[14px] grid gap-[14px] rounded-[14px] border border-(--rule-3) bg-(--sheet) p-[clamp(20px,2.4vw,26px)]">
						<PlusCorners />
						<div className="flex flex-wrap items-center justify-between gap-[14px]">
							<p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--accent-ink)">
								One record
							</p>
							<p className="font-mono text-[11px] tabular-nums tracking-[0.06em] text-(--ink-3)">
								Typed once · 08:14
							</p>
						</div>
						<p className="text-[clamp(18px,1.9vw,22px)] font-medium leading-[1.3] tracking-[-0.02em]">
							Whitfield Property Group
							<br />
							<span className="text-(--ink-2)">412 Ashfield Court</span>
						</p>
						<ul className="flex flex-wrap gap-[7px]">
							{RECORD_CHIPS.map((chip, i) => (
								<li
									key={chip}
									className={
										i === RECORD_CHIPS.length - 1
											? "rounded-full border border-(--rule-2) px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.08em] text-(--accent-ink)"
											: "rounded-full border border-(--rule-2) px-[11px] py-[5px] font-mono text-[10.5px] uppercase tracking-[0.08em] text-(--ink-2)"
									}
								>
									{chip}
								</li>
							))}
						</ul>
						<p className="border-t border-(--rule) pt-3 text-[14.5px] leading-[1.55] text-(--ink-2) text-pretty">
							Everything after the first entry reads off this. Nothing gets
							retyped, so nothing gets out of date.
						</p>
					</div>
				</div>
			</div>
		</Section>
	);
}

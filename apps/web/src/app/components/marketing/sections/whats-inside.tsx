import { CardEyebrowRow, Eyebrow, Section, SectionHeading } from "../primitives";
import { JobScenePlayer, type JobSceneKey } from "../scene-player";

/* WHAT'S INSIDE — three product-media cards, each a live job scene.
 * Copy is verbatim from the comp (design-import/OneTool Landing.dc.html,
 * lines 342–390). The cards are plain server markup; only the Player inside
 * JobScenePlayer is a client island. */

/* The scenes are authored at 2× (composition 700 wide for a ~350px slot, see
 * remotion/job-scenes/durations.ts), so letting the Player fill a narrow card
 * renders them at half scale. Pinning a minimum inner width of 430px puts the
 * scene's 22px body type at ~13.5px — the caption's own size, i.e. life-size —
 * and lets the slot CROP rather than shrink below that. Wider cards bleed to
 * 100%. Slot height is the shortest scene's natural height at 430 (620 × 430/700
 * ≈ 381); the taller scenes lose the bottom slack they were authored with. */
const SCENE_MIN_WIDTH = "max(100%, 430px)";
const SLOT_HEIGHT = 380;

const CARDS: Array<{
	scene: JobSceneKey;
	label: string;
	index: string;
	sceneLabel: string;
	caption: string;
}> = [
	{
		scene: "clientRecord",
		label: "Clients & properties",
		index: "01",
		sceneLabel:
			"The client record filling in: properties, contacts and every job to date",
		caption:
			"Every quote, visit, invoice and email for this client hangs off this one record. Nothing lives in a spreadsheet you have to remember to open.",
	},
	{
		scene: "weekPlan",
		label: "Schedule & crew",
		index: "02",
		sceneLabel: "The week's workload and the day's tasks landing on the schedule",
		caption:
			"Recurring work repeats itself — weekly mows, quarterly filter changes — and lands on the crew's phone with the address and notes already on it.",
	},
	{
		scene: "threadAssistant",
		label: "Inbox & assistant",
		index: "03",
		sceneLabel:
			"A client email thread, then a plain-English ask answered by the assistant",
		caption:
			"Email to and from a client stays beside their jobs, and the assistant turns a sentence into the task, the route or the report — showing its work as it goes.",
	},
];

export function WhatsInside() {
	return (
		<Section id="work">
			{/* Legacy deep-link alias: #features pointed here on the old page. */}
			<span id="features" aria-hidden="true" className="absolute left-0 top-0" />

			<Eyebrow>What&apos;s inside</Eyebrow>
			<SectionHeading className="max-w-[18ch]">
				Everything the job touches, in one record.
			</SectionHeading>

			<div
				className="mt-[clamp(40px,6vw,80px)] grid gap-[clamp(20px,3vw,40px)]"
				style={{
					gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))",
				}}
			>
				{CARDS.map((card) => (
					<article
						key={card.index}
						className="lp-lift grid content-start overflow-hidden rounded-2xl border border-(--rule-2) bg-(--sheet)"
					>
						<CardEyebrowRow label={card.label} index={card.index} />
						{/* Fixed-height window: the scene plays at life-size and crops. */}
						<div
							className="relative overflow-hidden border-b border-(--rule)"
							style={{ height: SLOT_HEIGHT }}
						>
							<div
								className="absolute left-1/2 top-0 -translate-x-1/2"
								style={{ width: SCENE_MIN_WIDTH }}
							>
								<JobScenePlayer scene={card.scene} label={card.sceneLabel} />
							</div>
						</div>
						<p className="px-6 py-3.5 text-[13.5px] text-(--ink-2)">
							{card.caption}
						</p>
					</article>
				))}
			</div>
		</Section>
	);
}

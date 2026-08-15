import SquaresTerminal from "@/components/react-bits/squares-terminal";
import { CARD_ONLY } from "@/remotion/job-scenes/durations";
import { AmbientLayer } from "../ambient";
import { CardEyebrowRow, Eyebrow, Section, SectionHeading } from "../primitives";
import { JobScenePlayer } from "../scene-player-lazy";
import type { JobSceneKey } from "../scene-player";

/* WHAT'S INSIDE — three product-media cards, each a live job scene.
 * Copy is verbatim from the comp (design-import/OneTool Landing.dc.html,
 * lines 342–390). The cards are plain server markup; only the Player inside
 * JobScenePlayer is a client island. */

/* Each slot carries its scene's own aspect ratio, so nothing is ever cropped —
 * the cards end up ragged along the bottom, which is the trade. The ratio lives
 * on this server markup rather than inside the (ssr:false) Player, or the three
 * slots would be 0px tall until the players hydrate. */
const slotRatio = (scene: JobSceneKey) =>
	`${CARD_ONLY.width} / ${CARD_ONLY[scene]}`;

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
			"Recurring work like weekly mows and quarterly filter changes repeats itself, and lands on the crew's phone with the address and notes already on it.",
	},
	{
		scene: "threadAssistant",
		label: "Inbox & assistant",
		index: "03",
		sceneLabel:
			"A client email thread, then a plain-English ask answered by the assistant",
		caption:
			"Email to and from a client stays beside their jobs, and the assistant turns a sentence into the task, the route or the report, showing its work as it goes.",
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

			{/* The card band sits on its own stacking context so the ambient terminal
			    field can run behind it (visible in the gutters, ink-only, no bloom). */}
			<div className="relative mt-[clamp(40px,6vw,80px)]">
				<AmbientLayer opacity={0.07}>
					<SquaresTerminal
						color="#1a1a1a"
						backgroundColor="transparent"
						columns={44}
						rows={26}
						speed={1.4}
						glow={0}
						vignette={0}
						cursorInteraction={false}
						dpr={1.5}
					/>
				</AmbientLayer>

				<div
					className="relative grid gap-[clamp(20px,3vw,40px)]"
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
							<div
								className="relative border-b border-(--rule)"
								style={{ aspectRatio: slotRatio(card.scene) }}
							>
								<JobScenePlayer
									scene={card.scene}
									label={card.sceneLabel}
									className="absolute inset-0"
								/>
							</div>
							<p className="px-6 py-3.5 text-[13.5px] text-(--ink-2)">
								{card.caption}
							</p>
						</article>
					))}
				</div>
			</div>
		</Section>
	);
}

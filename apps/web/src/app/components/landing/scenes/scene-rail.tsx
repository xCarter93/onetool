import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BlueprintRail, type RailScene } from "../blueprint/blueprint-rail";
import { SheetCode } from "../blueprint/sheet-frame";
import { AssistantScene, assistantMeta } from "./assistant";
import { AutomationScene, automationMeta, type SceneMeta } from "./automation";
import { EsignScene, esignMeta } from "./esign";

/**
 * A-101 — the three-act scene rail.
 *
 * ONE sticky scroller, three acts. Not three sections (the scroll cost of a
 * section each is what buries act three) and not tabs (a click is a toll booth
 * in front of the best content on the page).
 *
 * SERVER SHELL, CLIENT RAIL. Everything here — the sheet code, the section
 * heading, the act copy, all three scene subtrees — is server-rendered and
 * ships no JavaScript. The only island is <BlueprintRail>, which reads scroll
 * progress and decides which act is on the stage; the scenes are handed to it
 * as already-rendered children, so they stay server components inside it.
 *
 * TWO ORDERS, ONE SOURCE. Above lg the acts play on the sticky rail; below lg
 * they are simply stacked, each autoplaying once through its own <DrawIn>
 * observer, because a sticky rail on a phone is a scroll trap. Both orders read
 * the same `meta.ts` strings, so a label can never drift between them.
 *
 * The stacked order is display:none above lg rather than absent, which is what
 * puts every act's copy and artwork in the server HTML for crawlers even though
 * the rail mounts one act at a time. A display:none subtree never intersects,
 * so its <DrawIn> observers stay silent on desktop.
 *
 * Anchor ids live on the rail's scroll markers ONLY. The stacked order carries
 * none, because two elements sharing an id is invalid and the anchor that wins
 * is whichever the parser saw first — which on desktop would be the hidden one.
 */

/** The section's own sheet code. Real NCS discipline letter: A = architectural. */
const SHEET = "A-101";
const SHEET_TITLE = "Three scenes";

/**
 * The section heading. Two-tone, one <h2>: bold clause, then the muted
 * mechanism sentence that names the three acts in the order they play.
 */
const INTRO = {
	heading: "Three jobs you stop doing by hand.",
	body: "The automation that fires while you're driving, the quote your client signs on their phone, and the answer you get without building a report.",
} as const;

/**
 * The acts, in order. `content` is a server element — the rail only ever passes
 * it through, so nothing here crosses the client boundary except the strings.
 */
type Act = SceneMeta & { content: ReactNode };

const ACTS: readonly Act[] = [
	{ ...automationMeta, content: <AutomationScene /> },
	{ ...esignMeta, content: <EsignScene /> },
	{ ...assistantMeta, content: <AssistantScene /> },
];

const RAIL_SCENES: readonly RailScene[] = ACTS.map((act) => ({
	id: act.id,
	label: act.railLabel,
	heading: act.heading,
	body: act.body,
	content: act.content,
}));

/**
 * One act in the stacked (below lg) order: tracked-caps sheet tab as an
 * eyebrow, the same two-tone heading the rail shows, then the scene.
 */
function StackedAct({
	act,
	className,
}: {
	act: Act;
	className?: string;
}) {
	return (
		<div className={cn("relative", className)}>
			<p className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
				{act.railLabel}
			</p>
			<h3 className="mt-3 max-w-xl text-balance text-lg leading-snug tracking-[-0.01em] sm:text-xl">
				<span className="font-medium text-foreground">{act.heading}</span>{" "}
				<span className="text-muted-foreground">{act.body}</span>
			</h3>
			<div className="mt-8">{act.content}</div>
		</div>
	);
}

/**
 * The A-101 section. Keeps `id="how-it-works"` — the navbar link and the hero's
 * quiet CTA both point at it, and this rail is what "how it works" now means.
 *
 * Deliberately NOT `.bp-section` (content-visibility): it contains a sticky
 * descendant and a useScroll target, and content-visibility breaks both.
 */
export function SceneRail() {
	return (
		<section id="how-it-works" className="relative isolate">
			<div className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8">
				<SheetCode code={SHEET} label={SHEET_TITLE} />
				<h2 className="mt-5 max-w-3xl text-balance text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground sm:text-3xl lg:text-4xl">
					{INTRO.heading}{" "}
					<span className="text-muted-foreground">{INTRO.body}</span>
				</h2>
			</div>

			{/* Below lg: stacked acts, in order, each drawing itself once. */}
			<div className="mx-auto mt-14 max-w-3xl space-y-20 px-4 sm:mt-16 sm:px-6 lg:hidden">
				{ACTS.map((act) => (
					<StackedAct key={act.id} act={act} />
				))}
			</div>

			{/* lg and up: the sticky rail. */}
			<BlueprintRail scenes={RAIL_SCENES} className="mt-10" />
		</section>
	);
}

export default SceneRail;

import type { ReactNode } from "react";
import { SheetCode } from "../blueprint/sheet-frame";
import { AssistantScene, assistantMeta } from "./assistant";
import { AutomationScene, automationMeta, type SceneMeta } from "./automation";
import { EsignScene, esignMeta } from "./esign";
import {
	SCENE_HEADING_ID,
	SceneSwitcher,
	type SwitcherScene,
} from "./scene-switcher";

/**
 * A-101 — "How it works". Three acts, one stage, selected by tabs.
 *
 * The sticky 330vh rail this replaced bought its choreography with a screen of
 * dead scroll per act. The acts themselves are unchanged; only the way you get
 * to them is.
 *
 * SERVER SHELL, CLIENT SWITCHER. The sheet code and all three scene subtrees are
 * server-rendered; the only island is <SceneSwitcher>, which owns the active
 * index and is handed the scenes as already-rendered children.
 *
 * ONE SOURCE OF COPY. Every string comes from each act's `meta.ts`, so a plate
 * label can never drift from the heading it selects.
 *
 * No `.bp-section` (content-visibility) is needed here anymore — but it is also
 * not added, because the stage swaps height and content-visibility skips the
 * measurement.
 */

const SHEET = "A-101";
const SHEET_TITLE = "Three scenes";

type Act = SceneMeta & { content: ReactNode };

const ACTS: readonly Act[] = [
	{ ...automationMeta, content: <AutomationScene /> },
	{ ...esignMeta, content: <EsignScene /> },
	{ ...assistantMeta, content: <AssistantScene /> },
];

const SWITCHER_SCENES: readonly SwitcherScene[] = ACTS.map((act) => ({
	id: act.id,
	label: act.railLabel,
	heading: act.heading,
	body: act.body,
	content: act.content,
}));

/**
 * The A-101 section. Keeps `id="how-it-works"` — the navbar link and the hero's
 * quiet CTA both point at it.
 */
export function SceneRail() {
	return (
		<section
			id="how-it-works"
			aria-labelledby={SCENE_HEADING_ID}
			className="relative p-6 sm:p-10 lg:p-14"
		>
			<SheetCode code={SHEET} label={SHEET_TITLE} />

			<p className="sr-only">
				Three scenes from the product. Choose one to watch it drawn: the
				automation that fires while you are driving, the quote your client
				signs on their phone, and the answer you get without building a
				report.
			</p>

			<SceneSwitcher
				scenes={SWITCHER_SCENES}
				className="mt-5"
				tablistLabel="How it works — scenes"
			/>
		</section>
	);
}

export default SceneRail;

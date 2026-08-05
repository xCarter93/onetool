/**
 * The story-reel manifest: keys, labels, durations, poster frames and the
 * derived reel timeline.
 *
 * HARD RULE — this module must never import a scene component (directly or
 * transitively). Page-side code (`feature-animation*.tsx`, `feature-rail.tsx`,
 * `feature-chapters.tsx`) imports ONLY from here, so scene modules stay behind
 * the Player's `lazyComponent` dynamic import and out of the landing bundle.
 * `durations.ts` is likewise scene-free; keep it that way.
 */

import {
	ASSISTANT_DURATION,
	AUTOMATIONS_DURATION,
	CLIENTS_DURATION,
	INVOICE_PAID_DURATION,
	PORTAL_APPROVE_DURATION,
	QUOTE_BUILD_DURATION,
	REPORTS_DURATION,
	ROUTING_DURATION,
	TASKS_DURATION,
} from "./durations";

export const VIDEO_CONFIG = {
	fps: 30,
	width: 1600,
	height: 1000,
} as const;

export type FeatureKey =
	| "clients"
	| "quote-build"
	| "portal-approve"
	| "tasks"
	| "routing"
	| "invoice-paid"
	| "automations"
	| "assistant"
	| "reports";

export interface StoryChapter {
	key: FeatureKey;
	/** Composition id in Remotion Studio / renders. */
	id: string;
	label: string;
	durationInFrames: number;
	/**
	 * Scene-local frame that reads as fully settled. Used as the still for
	 * reduced-motion visitors and as the Player poster, so a paused embed shows
	 * the finished scene rather than frame 0.
	 */
	posterFrame: number;
	/**
	 * `"shell"` scenes render their content inside the reel's persistent
	 * AppFrame. `"full"` scenes own the whole canvas — the client-portal chapter
	 * is one, since a customer never sees the workspace chrome.
	 */
	layout: "shell" | "full";
}

/**
 * Chapter order = the rail order. Data, not code: adding or reordering a
 * chapter needs nothing beyond an entry here plus registrations in
 * `scene-parts.ts` / `scene-loaders.ts`.
 */
export const STORY_CHAPTERS: readonly StoryChapter[] = [
	{
		key: "clients",
		id: "Clients",
		label: "Client management",
		durationInFrames: CLIENTS_DURATION,
		posterFrame: 215,
		layout: "shell",
	},
	{
		key: "quote-build",
		id: "QuoteBuild",
		label: "Quote building",
		durationInFrames: QUOTE_BUILD_DURATION,
		posterFrame: 190,
		layout: "shell",
	},
	{
		key: "portal-approve",
		id: "PortalApprove",
		label: "Client approval",
		durationInFrames: PORTAL_APPROVE_DURATION,
		posterFrame: 210,
		layout: "full",
	},
	{
		key: "tasks",
		id: "Tasks",
		label: "Task scheduling",
		durationInFrames: TASKS_DURATION,
		posterFrame: 200,
		layout: "shell",
	},
	{
		key: "routing",
		id: "Routing",
		label: "Route planning",
		durationInFrames: ROUTING_DURATION,
		posterFrame: 236,
		layout: "shell",
	},
	{
		key: "invoice-paid",
		id: "InvoicePaid",
		label: "Invoicing & payment",
		durationInFrames: INVOICE_PAID_DURATION,
		posterFrame: 220,
		layout: "shell",
	},
	{
		key: "automations",
		id: "Automations",
		label: "Workflow automations",
		durationInFrames: AUTOMATIONS_DURATION,
		posterFrame: 288,
		layout: "shell",
	},
	{
		key: "assistant",
		id: "Assistant",
		label: "AI assistant",
		durationInFrames: ASSISTANT_DURATION,
		posterFrame: 224,
		layout: "shell",
	},
	{
		key: "reports",
		id: "Reports",
		label: "Reports",
		durationInFrames: REPORTS_DURATION,
		posterFrame: 180,
		layout: "shell",
	},
];

const BY_KEY = new Map(STORY_CHAPTERS.map((c) => [c.key, c]));

export const chapterFor = (key: FeatureKey): StoryChapter => {
	const chapter = BY_KEY.get(key);
	if (!chapter) throw new Error(`Unknown feature key: ${key}`);
	return chapter;
};

/** Blueprint-sweep length. Every reel transition uses the same value. */
export const REEL_TRANSITION = 20;

export interface StorySegment {
	key: FeatureKey;
	/** Reel frame where this chapter's own sequence (and its entry sweep) starts. */
	from: number;
	/**
	 * Reel frame to stop on. Equals the NEXT chapter's `from`, i.e. the instant
	 * before the outgoing sweep begins — so a reel paused here always shows one
	 * fully-entered scene and never a blended pair. It also means
	 * `to[i] === from[i + 1]`, so playing straight on is seamless.
	 */
	to: number;
}

/**
 * `<TransitionSeries>` overlaps each pair of sequences by the transition
 * length, so chapter i starts at `sum(d[0..i-1]) - i * T`, and the reel is
 * `sum(d) - (n - 1) * T` frames long. Pure arithmetic on `durations.ts` — no
 * scene module is reachable from here.
 */
const buildSegments = (): readonly StorySegment[] => {
	const segments: StorySegment[] = [];
	let from = 0;
	for (let i = 0; i < STORY_CHAPTERS.length; i++) {
		const chapter = STORY_CHAPTERS[i];
		const isLast = i === STORY_CHAPTERS.length - 1;
		const to = from + chapter.durationInFrames - (isLast ? 0 : REEL_TRANSITION);
		segments.push({ key: chapter.key, from, to });
		from = to;
	}
	return segments;
};

export const STORY_SEGMENTS = buildSegments();

export const STORY_REEL_DURATION = STORY_SEGMENTS[STORY_SEGMENTS.length - 1].to;

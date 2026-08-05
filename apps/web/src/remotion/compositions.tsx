import React from "react";
import { QUOTE_TO_PAID_DURATION } from "./durations";
import { themed, type FeatureCompositionProps } from "./lib/themed";
import { STORY_CHAPTERS, STORY_REEL_DURATION, VIDEO_CONFIG, type FeatureKey } from "./manifest";
import { Assistant } from "./scenes/assistant";
import { Automations } from "./scenes/automations";
import { Clients } from "./scenes/clients";
import { InvoicePaid } from "./scenes/invoice-paid";
import { PortalApprove } from "./scenes/portal-approve";
import { QuoteBuild } from "./scenes/quote-build";
import { QuoteToPaid } from "./scenes/quote-to-paid";
import { Reports } from "./scenes/reports";
import { Routing } from "./scenes/routing";
import { TasksSchedule } from "./scenes/tasks-schedule";
import { Showcase, SHOWCASE_DURATION } from "./showcase";
import { StoryReel } from "./story-reel";

export { themed, VIDEO_CONFIG };
export type { FeatureCompositionProps, FeatureKey };

export interface FeatureVideo {
	id: string;
	label: string;
	component: React.FC<FeatureCompositionProps>;
	durationInFrames: number;
}

const SCENES: Record<FeatureKey, React.FC> = {
	clients: Clients,
	"quote-build": QuoteBuild,
	"portal-approve": PortalApprove,
	tasks: TasksSchedule,
	routing: Routing,
	"invoice-paid": InvoicePaid,
	automations: Automations,
	assistant: Assistant,
	reports: Reports,
};

/**
 * Studio / render registry. NOT a page-side module — the landing page imports
 * `manifest.ts` and loads scenes through `scene-loaders.ts` instead, so this
 * eager graph never reaches the browser bundle.
 */
export const FEATURE_VIDEOS: Record<string, FeatureVideo> = {
	...Object.fromEntries(
		STORY_CHAPTERS.map((chapter) => [
			chapter.key,
			{
				id: chapter.id,
				label: chapter.label,
				component: themed(SCENES[chapter.key]),
				durationInFrames: chapter.durationInFrames,
			},
		]),
	),
	// Retired from the rail (wave 4 split it into quote-build / portal-approve /
	// invoice-paid) but still the Showcase reel's quote chapter, so it keeps a
	// composition of its own for renders and Studio.
	"quote-to-paid": {
		id: "QuoteToPaid",
		label: "Quote to paid (legacy)",
		component: themed(QuoteToPaid),
		durationInFrames: QUOTE_TO_PAID_DURATION,
	},
	"story-reel": {
		id: "StoryReel",
		label: "Story reel",
		component: themed(StoryReel),
		durationInFrames: STORY_REEL_DURATION,
	},
	showcase: {
		id: "Showcase",
		label: "Product tour",
		component: themed(Showcase),
		durationInFrames: SHOWCASE_DURATION,
	},
};

/** Compositions that stand alone at the top level of the Studio sidebar. */
export const TOP_LEVEL_IDS = ["story-reel", "showcase"] as const;

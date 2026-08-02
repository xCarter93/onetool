import React from "react";
import { AbsoluteFill } from "remotion";
import { fontFamily } from "./lib/font";
import { themeFor, type ThemeName } from "./lib/tokens";
import { ThemeProvider } from "./ui/primitives";
import { Assistant, ASSISTANT_DURATION } from "./scenes/assistant";
import { Automations, AUTOMATIONS_DURATION } from "./scenes/automations";
import { Clients, CLIENTS_DURATION } from "./scenes/clients";
import { QuoteToPaid, QUOTE_TO_PAID_DURATION } from "./scenes/quote-to-paid";
import { Reports, REPORTS_DURATION } from "./scenes/reports";
import { Routing, ROUTING_DURATION } from "./scenes/routing";
import { TasksSchedule, TASKS_DURATION } from "./scenes/tasks-schedule";
import { Showcase, SHOWCASE_DURATION } from "./showcase";

export interface FeatureCompositionProps {
	theme?: ThemeName;
	[key: string]: unknown;
}

export const VIDEO_CONFIG = {
	fps: 30,
	width: 1600,
	height: 1000,
} as const;

const themed = (Scene: React.FC): React.FC<FeatureCompositionProps> => {
	const Wrapped: React.FC<FeatureCompositionProps> = ({ theme = "light" }) => (
		<ThemeProvider theme={themeFor(theme)}>
			<AbsoluteFill style={{ fontFamily, backgroundColor: themeFor(theme).bg }}>
				<Scene />
			</AbsoluteFill>
		</ThemeProvider>
	);
	Wrapped.displayName = `Themed(${Scene.displayName ?? Scene.name ?? "Scene"})`;
	return Wrapped;
};

export interface FeatureVideo {
	id: string;
	label: string;
	component: React.FC<FeatureCompositionProps>;
	durationInFrames: number;
}

/** Every landing-page animation, keyed for <FeatureAnimation feature="…">. */
export const FEATURE_VIDEOS = {
	clients: {
		id: "Clients",
		label: "Client management",
		component: themed(Clients),
		durationInFrames: CLIENTS_DURATION,
	},
	"quote-to-paid": {
		id: "QuoteToPaid",
		label: "Quoting & invoicing",
		component: themed(QuoteToPaid),
		durationInFrames: QUOTE_TO_PAID_DURATION,
	},
	tasks: {
		id: "Tasks",
		label: "Task scheduling",
		component: themed(TasksSchedule),
		durationInFrames: TASKS_DURATION,
	},
	routing: {
		id: "Routing",
		label: "Route planning",
		component: themed(Routing),
		durationInFrames: ROUTING_DURATION,
	},
	automations: {
		id: "Automations",
		label: "Workflow automations",
		component: themed(Automations),
		durationInFrames: AUTOMATIONS_DURATION,
	},
	assistant: {
		id: "Assistant",
		label: "AI assistant",
		component: themed(Assistant),
		durationInFrames: ASSISTANT_DURATION,
	},
	reports: {
		id: "Reports",
		label: "Reports",
		component: themed(Reports),
		durationInFrames: REPORTS_DURATION,
	},
	showcase: {
		id: "Showcase",
		label: "Product tour",
		component: themed(Showcase),
		durationInFrames: SHOWCASE_DURATION,
	},
} satisfies Record<string, FeatureVideo>;

export type FeatureKey = keyof typeof FEATURE_VIDEOS;

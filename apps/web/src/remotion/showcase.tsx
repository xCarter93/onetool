import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { fadeUp, pop, progress } from "./lib/anim";
import { useTheme } from "./ui/primitives";
import { Assistant } from "./scenes/assistant";
import { Automations } from "./scenes/automations";
import { Clients } from "./scenes/clients";
import { QuoteToPaid } from "./scenes/quote-to-paid";
import { Reports } from "./scenes/reports";
import { Routing } from "./scenes/routing";
import { TasksSchedule } from "./scenes/tasks-schedule";

const T = 18; // transition length

const SCENE_DURATIONS = [240, 300, 240, 240, 270, 270, 240];

const INTRO = 90;
const OUTRO = 120;

export const SHOWCASE_DURATION =
	INTRO + OUTRO + SCENE_DURATIONS.reduce((sum, d) => sum + d, 0) - T * (SCENE_DURATIONS.length + 1);

const Intro: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: t.bg,
				alignItems: "center",
				justifyContent: "center",
				gap: 26,
			}}
		>
			<Img
				src={staticFile("OneTool-mark.png")}
				style={{
					height: 130,
					scale: String(pop(frame, fps, 5)),
					filter: `drop-shadow(0 20px 40px color-mix(in oklch, ${t.primary} 30%, transparent))`,
				}}
			/>
			<div style={{ fontSize: 68, fontWeight: 700, color: t.fg, ...fadeUp(frame, 16, 16) }}>
				Run your business on OneTool
			</div>
			<div style={{ fontSize: 28, color: t.mutedFg, ...fadeUp(frame, 28, 16) }}>
				Clients, quotes, invoices, crews, and payments — one calm workspace.
			</div>
		</AbsoluteFill>
	);
};

const Outro: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	return (
		<AbsoluteFill
			style={{ backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 30 }}
		>
			<div style={{ fontSize: 64, fontWeight: 700, color: t.fg, textAlign: "center", lineHeight: 1.15, ...fadeUp(frame, 6, 16) }}>
				Look professional.
				<br />
				Spend less time in the office.
			</div>
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 12,
					backgroundColor: t.primary,
					color: t.primaryFg,
					fontSize: 28,
					fontWeight: 600,
					borderRadius: 14,
					padding: "18px 38px",
					scale: String(pop(frame, fps, 26)),
					boxShadow: `0 16px 44px color-mix(in oklch, ${t.primary} 38%, transparent)`,
				}}
			>
				Start free with OneTool
				<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
					<path d="M5 12h14M13 5l7 7-7 7" />
				</svg>
			</div>
			<div style={{ fontSize: 21, color: t.mutedFg, opacity: progress(frame, 40, 14) }}>
				Free plan · no card required
			</div>
		</AbsoluteFill>
	);
};

/** The full landing reel: intro → 7 feature scenes → CTA, seamless transitions. */
export const Showcase: React.FC = () => {
	return (
		<TransitionSeries>
			<TransitionSeries.Sequence durationInFrames={INTRO} name="Intro">
				<Intro />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />
			<TransitionSeries.Sequence durationInFrames={240} name="Clients">
				<Clients />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={slide({ direction: "from-right" })} />
			<TransitionSeries.Sequence durationInFrames={300} name="Quotes → Paid">
				<QuoteToPaid />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={slide({ direction: "from-bottom" })} />
			<TransitionSeries.Sequence durationInFrames={240} name="Tasks">
				<TasksSchedule />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={slide({ direction: "from-right" })} />
			<TransitionSeries.Sequence durationInFrames={240} name="Routing">
				<Routing />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={slide({ direction: "from-bottom" })} />
			<TransitionSeries.Sequence durationInFrames={270} name="Automations">
				<Automations />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={slide({ direction: "from-right" })} />
			<TransitionSeries.Sequence durationInFrames={270} name="Assistant">
				<Assistant />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />
			<TransitionSeries.Sequence durationInFrames={240} name="Reports">
				<Reports />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition timing={linearTiming({ durationInFrames: T })} presentation={fade()} />
			<TransitionSeries.Sequence durationInFrames={OUTRO} name="Outro">
				<Outro />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	);
};

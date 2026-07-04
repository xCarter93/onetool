"use client";

import React from "react";
import { Timer, CalendarClock } from "lucide-react";
import type { ConfigPanelProps } from "../automation-sidebar";
import { ConfigPanelHeader } from "./config-panel-header";
import { PanelSection } from "./panel-primitives";

/** Tiny placeholder -- full delay config UI is a later task. */
export function DelayConfig(_props: ConfigPanelProps) {
	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={Timer}
				iconBgColor="bg-cyan-50 dark:bg-cyan-950/40"
				iconFgColor="text-cyan-600 dark:text-cyan-400"
				categoryBadge="Utilities"
				nodeTypeName="Delay"
			/>
			<PanelSection>
				<p className="text-sm text-muted-foreground">
					Configure in the panel — coming in a future update.
				</p>
			</PanelSection>
		</div>
	);
}

/** Tiny placeholder -- full delay-until config UI is a later task. */
export function DelayUntilConfig(_props: ConfigPanelProps) {
	return (
		<div className="flex flex-col h-full">
			<ConfigPanelHeader
				icon={CalendarClock}
				iconBgColor="bg-cyan-50 dark:bg-cyan-950/40"
				iconFgColor="text-cyan-600 dark:text-cyan-400"
				categoryBadge="Utilities"
				nodeTypeName="Delay until"
			/>
			<PanelSection>
				<p className="text-sm text-muted-foreground">
					Configure in the panel — coming in a future update.
				</p>
			</PanelSection>
		</div>
	);
}

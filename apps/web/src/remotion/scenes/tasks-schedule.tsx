import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { themed } from "../lib/themed";
import { SceneFrame, type SceneShell } from "../ui/scene-shell";
import { Avatar, Checkbox, Panel, StatusBadge, useTheme } from "../ui/primitives";

export { TASKS_DURATION } from "../durations";

export const TASKS_SHELL: SceneShell = {
	active: "Tasks",
	title: "Today",
	HeaderAction: () => <StatusBadge status="in-progress" label="Tuesday, Aug 4" />,
};

const TASKS = [
	{ title: "Walkthrough — Birch Grove HOA", time: "8:00 AM", who: "MC", status: "scheduled", doneAt: 70 },
	{ title: "Irrigation repair · Zone 3", time: "9:30 AM", who: "DL", status: "in-progress", doneAt: 105 },
	{ title: "Quote follow-up — Hendersons", time: "11:00 AM", who: "PC", status: "scheduled", doneAt: 140 },
	{ title: "Crew dispatch — Elm Street strip mall", time: "1:00 PM", who: "MC", status: "scheduled", doneAt: -1 },
	{ title: "Invoice review & send", time: "4:30 PM", who: "PC", status: "scheduled", doneAt: -1 },
];

/** Day plan: tasks check off one by one and the progress ring fills. */
export const TasksScheduleContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	// Ring, checkboxes and the "N of 5" label all read the same per-task ramp,
	// so the percentage can never disagree with what's checked off.
	const doneEach = TASKS.map((task) => (task.doneAt > 0 ? progress(frame, task.doneAt, 12) : 0));
	const doneCount = doneEach.filter((d) => d > 0.5).length;
	const ring = doneEach.reduce((sum, d) => sum + d, 0) / TASKS.length;
	const R = 52;
	const CIRC = 2 * Math.PI * R;

	return (
		<div style={{ position: "absolute", inset: 0, padding: 40, display: "flex", gap: 28 }}>
			{/* Task list */}
			<Panel style={{ flex: 1.6, padding: 26, ...fadeUp(frame, 6, 16) }}>
				<div style={{ fontWeight: 700, fontSize: 24, marginBottom: 14 }}>Day plan</div>
				{TASKS.map((task, i) => {
					const done = doneEach[i];
					return (
						<div
							key={task.title}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 18,
								padding: "17px 10px",
								borderRadius: 12,
								backgroundColor:
									done > 0.5 ? `color-mix(in oklch, ${t.success} 5%, transparent)` : "transparent",
								borderBottom: `1px solid ${t.border}`,
								...fadeUp(frame, 16 + i * 9, 13, 18),
							}}
						>
							<Checkbox checked={done} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										fontWeight: 600,
										fontSize: 22,
										color: done > 0.5 ? t.mutedFg : t.fg,
										textDecoration: done > 0.5 ? "line-through" : "none",
									}}
								>
									{task.title}
								</div>
							</div>
							<span
								style={{
									fontSize: 18,
									fontWeight: 600,
									color: t.mutedFg,
									backgroundColor: t.muted,
									borderRadius: 999,
									padding: "6px 14px",
								}}
							>
								{task.time}
							</span>
							<Avatar initials={task.who} size={40} />
							<StatusBadge
								status={done > 0.5 ? "completed" : task.status}
								size={17}
								style={{ width: 148, justifyContent: "center" }}
							/>
						</div>
					);
				})}
			</Panel>

			{/* Progress rail */}
			<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}>
				<Panel style={{ padding: 30, display: "flex", alignItems: "center", gap: 28, ...fadeUp(frame, 24, 16) }}>
					<svg width={128} height={128} viewBox="0 0 128 128">
						<circle cx={64} cy={64} r={R} fill="none" stroke={t.muted} strokeWidth={13} />
						<circle
							cx={64}
							cy={64}
							r={R}
							fill="none"
							stroke={t.primary}
							strokeWidth={13}
							strokeLinecap="round"
							strokeDasharray={CIRC}
							strokeDashoffset={CIRC * (1 - ring)}
							transform="rotate(-90 64 64)"
						/>
						<text
							x={64}
							y={72}
							textAnchor="middle"
							fontSize={30}
							fontWeight={700}
							fill={t.fg}
						>
							{Math.round(ring * 100)}%
						</text>
					</svg>
					<div>
						<div style={{ fontWeight: 700, fontSize: 26 }}>
							{doneCount} of {TASKS.length} done
						</div>
						<div style={{ color: t.mutedFg, fontSize: 19, marginTop: 4 }}>
							On track — next crew dispatch at 1:00 PM
						</div>
					</div>
				</Panel>

				<Panel style={{ padding: 30, flex: 1, ...fadeUp(frame, 36, 16) }}>
					<div style={{ fontWeight: 700, fontSize: 24, marginBottom: 18 }}>This week</div>
					<div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
						{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => {
							const heights = [0.55, 0.85, 0.4, 0.7, 0.3];
							const h = heights[i] * progress(frame, 50 + i * 6, 20) * 150;
							return (
								<div
									key={day}
									style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
								>
									<div style={{ height: 160, display: "flex", alignItems: "flex-end" }}>
										<div
											style={{
												width: 40,
												height: Math.max(6, h),
												borderRadius: 8,
												backgroundColor: i === 1 ? t.primary : t.chart3,
												scale: `1 ${0.94 + pop(frame, fps, 50 + i * 6) * 0.06}`,
												transformOrigin: "bottom",
											}}
										/>
									</div>
									<span style={{ fontSize: 18, color: i === 1 ? t.fg : t.mutedFg, fontWeight: i === 1 ? 700 : 500, marginTop: 10 }}>
										{day}
									</span>
								</div>
							);
						})}
					</div>
				</Panel>
			</div>
		</div>
	);
};

export const TasksSchedule: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={TASKS_SHELL}>
			<TasksScheduleContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(TasksSchedule);

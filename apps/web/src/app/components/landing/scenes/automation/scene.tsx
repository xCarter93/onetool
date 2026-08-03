import type { CSSProperties } from "react";
import { GitBranch, ListTodo, Mail, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawIn } from "../../blueprint/draw-in";
import { GuideLines } from "../../blueprint/guide-lines";
import { SheetCode } from "../../blueprint/sheet-frame";
import {
	AUTOMATION_LATTICE,
	AUTOMATION_NAME,
	AUTOMATION_STATE,
	BRANCH_FALSE,
	BRANCH_TRUE,
	COL_H,
	COL_W,
	CORNER_Y,
	EDGES,
	FALSE_PLUS_Y,
	FALSE_X,
	FLOW_DASH,
	FLOW_EDGE,
	NODES,
	RULE_SENTENCE,
	SPINE_X,
	T,
	TERMINAL_PLUS_Y,
} from "./automation-data";
import {
	BranchPill,
	CHIP_SUCCESS,
	FlowEdge,
	FlowNode,
	StubPlus,
} from "./flow-parts";
import { automationMeta } from "./meta";
import { RunPulse } from "./run-edge";

/**
 * A-101 act 1 — "Automate the busywork".
 *
 * The automation editor, drawn small and true: the product's own dot-grid
 * canvas, its 280px-class step cards with their 4px left accent bars, its
 * amber/violet/sky/green node identities, its solid-vs-dashed edge grammar, and
 * its 700ms marching-dash run animation.
 *
 * Server component apart from one client island. The single <DrawIn> observer
 * adds one class and every beat below fires off its own CSS `--bp-delay`, so the
 * whole scene inherits the reduced-motion terminal state and the <noscript>
 * floor for free. The one exception is <RunPulse>, which carries its own
 * useReducedMotion() gate — and whose absence leaves the scene on exactly the
 * same terminal still.
 *
 * Two inks, held apart: inside the canvas plate everything is the product
 * (semantic hues, StatusBadge chips, --border, --muted-foreground). Outside it,
 * only zinc and sky. No semantic colour ever enters the blueprint layer.
 */

const NODE_ICONS: Record<string, LucideIcon> = {
	trigger: Zap,
	condition: GitBranch,
	email: Mail,
	task: ListTodo,
};

/* ---------------------------------------------------------------------------
 * Entry framing
 * ------------------------------------------------------------------------- */

/**
 * The plain-English rule, before any nodes.
 *
 * A landscaper should understand what this drawing DOES before being asked to
 * read five cards, so the when/then sentence leads and the editor illustrates
 * it. Quiet on purpose: no eyebrow, no icon, one sky glyph. It is also an opaque
 * plate, which is what keeps the lattice from running under it.
 */
function RuleCard() {
	return (
		<div className="relative mx-auto max-w-[420px] rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10">
			<p className="text-[13px] leading-relaxed text-foreground sm:text-sm">
				<span className="text-muted-foreground">When</span>{" "}
				<span className="font-medium">{RULE_SENTENCE.when}</span>{" "}
				<span aria-hidden="true" className="font-medium text-bp-anno">
					→
				</span>
				<span className="sr-only">, then</span>{" "}
				<span className="font-medium">{RULE_SENTENCE.then}</span>
			</p>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * The miniature
 * ------------------------------------------------------------------------- */

/**
 * The plate carries no overflow-hidden: the run's success rings are drawn 3px
 * outside their cards, and at the narrowest viewport the column is the full
 * width of the plate. A clipped ring reads as a bug, so the two inner surfaces
 * carry the rounding themselves instead.
 */
function FlowCanvas() {
	return (
		<div className="relative mx-auto mt-6 w-full max-w-[420px] rounded-xl bg-background ring-1 ring-foreground/10">
			{/* Editor chrome: the automation's real name and its published state. */}
			<div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-card px-3 py-2">
				<span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none text-foreground">
					{AUTOMATION_NAME}
				</span>
				<span
					className={cn(
						"shrink-0 rounded-full border px-1.5 py-px text-[9px] font-medium leading-[14px]",
						CHIP_SUCCESS,
					)}
				>
					{AUTOMATION_STATE}
				</span>
			</div>

			{/*
			 * The canvas. `.bp-dotgrid` retuned to the product's own React Flow
			 * background — Dots, gap 20, size 1 — so the texture under the miniature
			 * is the texture under the real editor.
			 */}
			<div
				className="bp-dotgrid relative rounded-b-xl py-5"
				style={{ "--bp-grid-major": "20px" } as CSSProperties}
			>
				<div
					className="relative mx-auto"
					style={{ width: COL_W, height: COL_H }}
				>
					{/*
					 * Edge layer, pixel-mapped (no viewBox) so the product's `5 4` dash
					 * rhythm is literal. It sits under the cards, which is what lets the
					 * run pulse pass behind them exactly as it does in the app.
					 */}
					<svg
						aria-hidden="true"
						focusable="false"
						width={COL_W}
						height={COL_H}
						className="pointer-events-none absolute inset-0"
					>
						<FlowEdge d={EDGES.triggerToCondition} delay={T.edge[0]} />
						<FlowEdge d={EDGES.trueLane} delay={T.edge[1]} />
						<FlowEdge d={EDGES.emailToTask} delay={T.edge[2]} />
						<FlowEdge d={EDGES.falseLane} dash delay={T.falseLane} />
						<FlowEdge d={EDGES.terminalStub} dash delay={T.stub} />
					</svg>

					<RunPulse />

					{NODES.map((node, i) => (
						<FlowNode
							key={node.key}
							y={node.y}
							accent={node.accent}
							icon={NODE_ICONS[node.key]}
							title={node.title}
							description={node.description}
							category={node.category}
							eyebrow={node.eyebrow}
							cardDelay={T.card[i]}
							ringDelay={T.ring[i]}
						/>
					))}

					<BranchPill x={SPINE_X} y={CORNER_Y} delay={T.pill[0]}>
						{BRANCH_TRUE}
					</BranchPill>
					<BranchPill x={FALSE_X} y={CORNER_Y} delay={T.pill[1]}>
						{BRANCH_FALSE}
					</BranchPill>

					<StubPlus x={FALSE_X} y={FALSE_PLUS_Y} delay={T.stub} />
					<StubPlus x={SPINE_X} y={TERMINAL_PLUS_Y} delay={T.stub} />
				</div>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * The scene's ONE annotation device
 * ------------------------------------------------------------------------- */

function LineTypeSwatch({ dash }: { dash?: boolean }) {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			width={22}
			height={6}
			className="shrink-0"
		>
			<path
				d="M 0 3 L 22 3"
				fill="none"
				strokeDasharray={dash ? FLOW_DASH : undefined}
				strokeLinecap="butt"
				style={{ stroke: FLOW_EDGE, strokeWidth: 1.5 }}
			/>
		</svg>
	);
}

/**
 * A line-type legend — a real drawing convention, and the section's single
 * annotation device.
 *
 * It exists because the drawing genuinely uses two line types to mean two
 * different things, which is the "inevitability" test: delete the legend and a
 * reader has no way to know the dashed lane is a branch nobody built. It sits
 * outside the plate, so no leader crosses into the product miniature — the
 * annotated-miniature device belongs to A-501.
 */
function LineTypeLegend() {
	return (
		<div className="mx-auto mt-4 flex max-w-[420px] flex-wrap items-center gap-x-5 gap-y-1.5">
			<span className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno">
				Line types
			</span>
			<span className="flex items-center gap-2 text-[11px] leading-none text-muted-foreground">
				<LineTypeSwatch />
				Built path
			</span>
			<span className="flex items-center gap-2 text-[11px] leading-none text-muted-foreground">
				<LineTypeSwatch dash />
				Not built yet
			</span>
		</div>
	);
}

/* ---------------------------------------------------------------------------
 * Scene
 * ------------------------------------------------------------------------- */

/**
 * The stage. Carries no sheet code and no heading: the rail owns scene identity
 * and reads it from meta.ts, so putting either here would duplicate the rail's
 * own label. Use <AutomationSceneSection> to render it on its own.
 */
export function AutomationScene({ className }: { className?: string }) {
	return (
		<DrawIn className={cn("relative mx-auto w-full max-w-3xl", className)}>
			{/*
			 * Quiet construction lattice. Static rather than wiped: the hero owns the
			 * page's one orchestrated draw-on moment, and inside a crossfading rail
			 * the paper should already be there while the run is what moves. Static
			 * also means no second client island.
			 *
			 * The rule card and the canvas are opaque plates, so guides behind them
			 * are occluded rather than running under text, and the mask keeps them
			 * off the band the legend occupies.
			 */}
			<svg
				aria-hidden="true"
				focusable="false"
				className="pointer-events-none absolute inset-0 h-full w-full"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent, #000 10%, #000 86%, transparent)",
				}}
			>
				<GuideLines guides={AUTOMATION_LATTICE} />
			</svg>

			{/*
			 * What the geometry says and the card text does not: the running order,
			 * the branch structure, and the outcome of the run. Every other fact in
			 * this scene is already visible DOM text.
			 */}
			<p className="sr-only">
				The four steps run top to bottom: the trigger, then the condition, then
				its two branches. Send Email and Create Task both sit on the “Is true”
				branch. The “Is false” branch is empty — a dashed lane marks work that
				has not been built. When the automation runs, every step on the “Is
				true” branch completes.
			</p>

			<div className="relative">
				<RuleCard />
				<FlowCanvas />
				<LineTypeLegend />
			</div>
		</DrawIn>
	);
}

/**
 * Standalone framing, for rendering the act as a plain section before the sticky
 * rail exists. The rail replaces this wrapper — it renders <AutomationScene>
 * directly and supplies the sheet code and the two-tone heading itself.
 */
export function AutomationSceneSection({ className }: { className?: string }) {
	return (
		<section
			id={automationMeta.id}
			className={cn("relative isolate py-20 sm:py-24", className)}
		>
			<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
				<SheetCode code="A-101" label={automationMeta.railLabel} />
				<h2 className="mt-5 max-w-2xl text-balance text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">
					{automationMeta.heading}{" "}
					<span className="text-muted-foreground">{automationMeta.body}</span>
				</h2>
				<AutomationScene className="mt-12" />
			</div>
		</section>
	);
}

export default AutomationScene;

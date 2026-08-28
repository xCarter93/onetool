"use client";

import { Fragment, useMemo, useState } from "react";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Plus, X } from "lucide-react";
import type { ReportEntityType } from "@onetool/backend/convex/lib/reportFields";
import type {
	ReportFilterGroup,
	ReportFilterRule,
	ReportFilters,
} from "@onetool/backend/convex/lib/reportFilters";
import type { FilterAdapter } from "@/components/shared/filter-adapter";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { reportFilterAdapter } from "./report-filter-adapter";
import {
	MAX_GROUPS,
	MAX_RULES_PER_GROUP,
	isDraftComplete,
	moveRuleBetweenGroups,
	reorderGroups,
	type RuleDropTarget,
} from "./report-filter-model";
import { FilterRuleControls } from "./report-filter-rule-controls";

function blankRule(): ReportFilterRule {
	return { field: "", operator: "equals", value: undefined };
}

const groupId = (index: number) => `group:${index}`;
const groupDropId = (index: number) => `group-drop:${index}`;
const ruleId = (groupIndex: number, ruleIndex: number) =>
	`rule:${groupIndex}:${ruleIndex}`;

/** Every draggable id encodes its group, so any drop id yields a target group. */
function groupIndexOf(id: string): number | null {
	const parts = id.split(":");
	const index = Number(parts[1]);
	return Number.isInteger(index) ? index : null;
}

export interface ReportFiltersEditorProps {
	entityType: ReportEntityType;
	filters: ReportFilters | undefined;
	onChange: (filters: ReportFilters | undefined) => void;
}

/**
 * The grouped AND/OR editor (§8 d15 F5): group cards mirroring the v2 model,
 * live-applied on every change. Rules drag between cards (that changes the
 * query, so drop targets are emphasized); cards reorder cosmetically.
 */
export function ReportFiltersEditor({
	entityType,
	filters,
	onChange,
}: ReportFiltersEditorProps) {
	const adapter = useMemo(() => reportFilterAdapter(entityType), [entityType]);
	const groups = filters?.groups ?? [];
	const topLogic = filters?.logic ?? "and";
	const reducedMotion = usePrefersReducedMotion();

	const [dragging, setDragging] = useState<string | null>(null);
	const sensors = useSensors(
		// A short drag threshold keeps the grip's own click/focus behavior intact.
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const commit = (nextGroups: ReportFilterGroup[]) => {
		onChange(
			nextGroups.length === 0 ? undefined : { logic: topLogic, groups: nextGroups }
		);
	};

	const updateGroup = (groupIndex: number, group: ReportFilterGroup) => {
		commit(groups.map((g, i) => (i === groupIndex ? group : g)));
	};

	const moveRule = (
		from: { groupIndex: number; ruleIndex: number },
		to: RuleDropTarget
	) => {
		const next = moveRuleBetweenGroups(groups, from, to);
		if (next !== groups) commit(next);
	};

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		setDragging(null);
		if (!over || over.id === active.id) return;
		const activeId = String(active.id);
		const targetGroup = groupIndexOf(String(over.id));
		if (targetGroup === null) return;

		if (activeId.startsWith("group:")) {
			const from = groupIndexOf(activeId);
			if (from === null) return;
			const next = reorderGroups(groups, from, targetGroup);
			if (next !== groups) commit(next);
			return;
		}

		const [, sourceGroup, sourceRule] = activeId.split(":").map(Number);
		const overId = String(over.id);
		moveRule(
			{ groupIndex: sourceGroup, ruleIndex: sourceRule },
			overId.startsWith("rule:")
				? { groupIndex: targetGroup, ruleIndex: Number(overId.split(":")[2]) }
				: { groupIndex: targetGroup }
		);
	};

	const draggingRule = dragging?.startsWith("rule:") ?? false;
	const draggingFromGroup = draggingRule
		? groupIndexOf(dragging as string)
		: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={({ active }: DragStartEvent) => setDragging(String(active.id))}
			onDragCancel={() => setDragging(null)}
			onDragEnd={handleDragEnd}
		>
			<div className="space-y-2">
				<SortableContext
					items={groups.map((_, i) => groupId(i))}
					strategy={verticalListSortingStrategy}
				>
					{groups.map((group, groupIndex) => (
						<Fragment key={groupId(groupIndex)}>
							{groupIndex > 0 && (
								<div className="flex items-center gap-2 px-4">
									<div className="h-px flex-1 bg-border/60" />
									<button
										type="button"
										onClick={() =>
											onChange({
												logic: topLogic === "and" ? "or" : "and",
												groups,
											})
										}
										className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
									>
										{topLogic === "and" ? "And" : "Or"}
									</button>
									<div className="h-px flex-1 bg-border/60" />
								</div>
							)}
							<GroupCard
								entityType={entityType}
								adapter={adapter}
								group={group}
								groupIndex={groupIndex}
								groupCount={groups.length}
								reducedMotion={reducedMotion}
								isRuleDropTarget={
									draggingRule && draggingFromGroup !== groupIndex
								}
								onChange={(next) => updateGroup(groupIndex, next)}
								onRemove={() =>
									commit(groups.filter((_, i) => i !== groupIndex))
								}
								onMoveRule={moveRule}
							/>
						</Fragment>
					))}
				</SortableContext>

				{groups.length < MAX_GROUPS && (
					<button
						type="button"
						onClick={() => commit([...groups, { logic: "and", rules: [blankRule()] }])}
						className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
					>
						<Plus className="h-3.5 w-3.5" /> Add group
					</button>
				)}

				<div className="flex justify-end border-t border-border/60 pt-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={groups.length === 0}
						onClick={() => onChange(undefined)}
					>
						Clear all filters
					</Button>
				</div>
			</div>
		</DndContext>
	);
}

function GroupCard({
	entityType,
	adapter,
	group,
	groupIndex,
	groupCount,
	reducedMotion,
	isRuleDropTarget,
	onChange,
	onRemove,
	onMoveRule,
}: {
	entityType: ReportEntityType;
	adapter: FilterAdapter;
	group: ReportFilterGroup;
	groupIndex: number;
	groupCount: number;
	reducedMotion: boolean;
	isRuleDropTarget: boolean;
	onChange: (group: ReportFilterGroup) => void;
	onRemove: () => void;
	onMoveRule: (
		from: { groupIndex: number; ruleIndex: number },
		to: RuleDropTarget
	) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: groupId(groupIndex) });
	const { setNodeRef: setDropRef, isOver } = useDroppable({
		id: groupDropId(groupIndex),
	});

	const setRules = (rules: ReportFilterRule[]) => onChange({ ...group, rules });

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition: reducedMotion ? undefined : transition,
			}}
			className={cn(
				"rounded-xl border border-border/60 bg-muted/20",
				isDragging && "opacity-50",
				isRuleDropTarget && "border-dashed border-primary/50",
				isRuleDropTarget && isOver && "border-solid border-primary bg-primary/5"
			)}
		>
			<div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
				<button
					type="button"
					aria-label={`Reorder group ${groupIndex + 1}`}
					className="cursor-grab rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="h-3.5 w-3.5" />
				</button>
				<p className="text-xs font-medium text-muted-foreground">
					Group {groupIndex + 1}
				</p>
				{group.rules.length > 1 && (
					<button
						type="button"
						onClick={() =>
							onChange({ ...group, logic: group.logic === "and" ? "or" : "and" })
						}
						className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
					>
						{group.logic === "and" ? "Match all" : "Match any"}
					</button>
				)}
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Remove group ${groupIndex + 1}`}
					className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			<div ref={setDropRef} className="space-y-1.5 p-2">
				<SortableContext
					items={group.rules.map((_, i) => ruleId(groupIndex, i))}
					strategy={verticalListSortingStrategy}
				>
					{group.rules.map((rule, ruleIndex) => (
						<GroupRuleRow
							key={ruleId(groupIndex, ruleIndex)}
							entityType={entityType}
							adapter={adapter}
							rule={rule}
							groupIndex={groupIndex}
							ruleIndex={ruleIndex}
							groupCount={groupCount}
							reducedMotion={reducedMotion}
							onChange={(next) =>
								setRules(group.rules.map((r, i) => (i === ruleIndex ? next : r)))
							}
							onRemove={() =>
								setRules(group.rules.filter((_, i) => i !== ruleIndex))
							}
							onMoveToGroup={(target) =>
								onMoveRule({ groupIndex, ruleIndex }, { groupIndex: target })
							}
						/>
					))}
				</SortableContext>

				{group.rules.length < MAX_RULES_PER_GROUP && (
					<button
						type="button"
						onClick={() => setRules([...group.rules, blankRule()])}
						className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border/50 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
					>
						<Plus className="h-3 w-3" /> Add filter
					</button>
				)}
			</div>
		</div>
	);
}

function GroupRuleRow({
	entityType,
	adapter,
	rule,
	groupIndex,
	ruleIndex,
	groupCount,
	reducedMotion,
	onChange,
	onRemove,
	onMoveToGroup,
}: {
	entityType: ReportEntityType;
	adapter: FilterAdapter;
	rule: ReportFilterRule;
	groupIndex: number;
	ruleIndex: number;
	groupCount: number;
	reducedMotion: boolean;
	onChange: (rule: ReportFilterRule) => void;
	onRemove: () => void;
	onMoveToGroup: (groupIndex: number) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: ruleId(groupIndex, ruleIndex) });
	const label = rule.field ? adapter.fieldLabel(rule.field) : "filter";
	const targets = Array.from({ length: groupCount }, (_, i) => i).filter(
		(i) => i !== groupIndex
	);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition: reducedMotion ? undefined : transition,
			}}
			className={isDragging ? "opacity-50" : undefined}
		>
			<FilterRuleControls
				entityType={entityType}
				adapter={adapter}
				rule={rule}
				onChange={onChange}
				className="bg-background"
				leading={
					<button
						type="button"
						aria-label={`Reorder ${label}`}
						className="cursor-grab rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="h-3.5 w-3.5" />
					</button>
				}
				trailing={
					<div className="flex shrink-0 items-center">
						{targets.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger
									aria-label={`More actions for ${label}`}
									render={
										<button
											type="button"
											className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										/>
									}
								>
									<MoreHorizontal className="h-3.5 w-3.5" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{targets.map((target) => (
										<DropdownMenuItem
											key={target}
											onClick={() => onMoveToGroup(target)}
										>
											Move to group {target + 1}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<button
							type="button"
							onClick={onRemove}
							aria-label={`Remove ${label} filter`}
							className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				}
			/>
			{!isDraftComplete(rule) && rule.field && (
				<p className="px-2 pt-1 text-[11px] text-muted-foreground">
					Add a value to apply this filter.
				</p>
			)}
		</div>
	);
}

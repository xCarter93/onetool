"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	FormulaError,
	parseFormula,
	runFormula,
	FORMULA_FUNCTIONS,
	type FormulaFnDoc,
	type Val,
} from "@onetool/backend/convex/lib/formula";
import Modal from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	FORMULA_RETURN_TYPES,
	type AutomationObjectType,
	type AutomationTrigger,
	type FormulaResource,
	type FormulaReturnType,
	type TriggerConfig,
	type WorkflowNode,
} from "../../lib/node-types";
import { getAllVariableOptions } from "../../lib/variables";

/** A record the formula preview can resolve trigger.record.<field> against. */
export type SampleRecord = {
	entityType: AutomationObjectType;
	entityId: string;
	label: string;
};

export interface FormulaEditorModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** null = create mode. */
	formula: FormulaResource | null;
	formulas: FormulaResource[];
	nodes: WorkflowNode[];
	trigger: TriggerConfig | AutomationTrigger | null;
	sampleRecords: SampleRecord[];
	onSave: (formula: FormulaResource) => void;
	onDelete?: (id: string) => void;
}

const RETURN_TYPE_LABELS: Record<FormulaReturnType, string> = {
	number: "Number",
	currency: "Currency",
	text: "Text",
	date: "Date",
	boolean: "True/False",
};

const FUNCTION_CATEGORY_LABELS: Record<FormulaFnDoc["category"], string> = {
	number: "Number",
	logic: "Logic",
	text: "Text",
	date: "Date",
};

function generateFormulaId(): string {
	return `f_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

/** Narrow an arbitrary resolved value to the formula engine's Val union. */
function toFormulaVal(value: unknown): Val {
	if (value === null || value === undefined) return null;
	if (
		typeof value === "number" ||
		typeof value === "string" ||
		typeof value === "boolean" ||
		value instanceof Date
	) {
		return value;
	}
	return null;
}

function formatPreviewValue(value: Val): string {
	if (value === null) return "(empty)";
	if (value instanceof Date) return value.toLocaleString();
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}

/** Order-preserving group-by, shared by the Variables and Functions reference lists. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
	const groups: [string, T[]][] = [];
	for (const item of items) {
		const key = keyOf(item);
		const existing = groups.find(([g]) => g === key);
		if (existing) existing[1].push(item);
		else groups.push([key, [item]]);
	}
	return groups;
}

/**
 * Create/edit modal for a single formula resource. Two-pane layout: a
 * monospace expression editor (with live parse + preview) on the left, and a
 * click-to-insert reference (variables + functions) on the right.
 */
export function FormulaEditorModal({
	open,
	onOpenChange,
	formula,
	formulas,
	nodes,
	trigger,
	sampleRecords,
	onSave,
	onDelete,
}: FormulaEditorModalProps) {
	const [name, setName] = useState("");
	const [returnType, setReturnType] = useState<FormulaReturnType>("text");
	const [expression, setExpression] = useState("");
	const [parseError, setParseError] = useState<string | null>(null);
	const [preview, setPreview] = useState<
		{ ok: true; text: string } | { ok: false; message: string } | null
	>(null);
	const [sampleId, setSampleId] = useState<string | undefined>(undefined);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Reset editing state whenever the modal opens (create, or edit a formula).
	// Guarded render-time derivation instead of an effect; `sessionKey` goes
	// null on close so reopening the same formula still resets.
	const [sessionKey, setSessionKey] = useState<string | null>(null);
	const nextSessionKey = open ? (formula?.id ?? "new") : null;
	if (nextSessionKey !== sessionKey) {
		setSessionKey(nextSessionKey);
		if (nextSessionKey !== null) {
			setName(formula?.name ?? "");
			setReturnType(formula?.returnType ?? "text");
			setExpression(formula?.expression ?? "");
			setSampleId(undefined);
		}
	}

	const selectedSample =
		sampleRecords.find((r) => r.entityId === sampleId) ?? sampleRecords[0];

	// Only one of these ever fires (gated by entityType); the rest are "skip".
	const clientDoc = useQuery(
		api.clients.get,
		selectedSample?.entityType === "client"
			? { id: selectedSample.entityId as Id<"clients"> }
			: "skip"
	);
	const projectDoc = useQuery(
		api.projects.get,
		selectedSample?.entityType === "project"
			? { id: selectedSample.entityId as Id<"projects"> }
			: "skip"
	);
	const quoteDoc = useQuery(
		api.quotes.get,
		selectedSample?.entityType === "quote"
			? { id: selectedSample.entityId as Id<"quotes"> }
			: "skip"
	);
	const invoiceDoc = useQuery(
		api.invoices.get,
		selectedSample?.entityType === "invoice"
			? { id: selectedSample.entityId as Id<"invoices"> }
			: "skip"
	);
	const taskDoc = useQuery(
		api.tasks.get,
		selectedSample?.entityType === "task"
			? { id: selectedSample.entityId as Id<"tasks"> }
			: "skip"
	);
	const recordFields = (clientDoc ?? projectDoc ?? quoteDoc ?? invoiceDoc ?? taskDoc) as
		| Record<string, unknown>
		| null
		| undefined;

	const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

	// Formulas this one may reference — excludes itself (no self-reference).
	const referenceFormulas = useMemo(
		() => formulas.filter((f) => f.id !== formula?.id),
		[formulas, formula]
	);
	const formulasById = useMemo(
		() => new Map(referenceFormulas.map((f) => [f.id, f])),
		[referenceFormulas]
	);

	// Best-effort resolver for the live preview: trigger.record.<field> from the
	// selected sample, workflow.now, and formula.<id> recursion with a cycle
	// guard. Everything else (node./loop.* — no live execution state here) → null.
	const resolve = useMemo(() => {
		function resolvePath(path: string, resolving: Set<string>): Val {
			if (path.startsWith("trigger.record.")) {
				const field = path.slice("trigger.record.".length);
				return toFormulaVal(recordFields?.[field]);
			}
			if (path === "workflow.now") return Date.now();
			if (path.startsWith("formula.")) {
				const id = path.slice("formula.".length);
				if (resolving.has(id)) return null;
				const dep = formulasById.get(id);
				if (!dep) return null;
				resolving.add(id);
				try {
					return runFormula(dep.expression, {
						resolve: (p) => resolvePath(p, resolving),
						now: Date.now(),
						tz,
					});
				} catch {
					return null;
				} finally {
					resolving.delete(id);
				}
			}
			return null;
		}
		return (path: string) => resolvePath(path, new Set());
	}, [recordFields, formulasById, tz]);

	// Debounced validate + preview. Never blocks typing.
	useEffect(() => {
		const timer = setTimeout(() => {
			try {
				parseFormula(expression);
				setParseError(null);
			} catch (err) {
				setParseError(err instanceof FormulaError ? err.message : "Invalid formula");
				setPreview(null);
				return;
			}
			try {
				const value = runFormula(expression, { resolve, now: Date.now(), tz });
				setPreview({ ok: true, text: formatPreviewValue(value) });
			} catch (err) {
				setPreview({
					ok: false,
					message: err instanceof FormulaError ? err.message : "Could not evaluate",
				});
			}
		}, 250);
		return () => clearTimeout(timer);
	}, [expression, resolve, tz]);

	const variableGroups = useMemo(() => {
		if (!trigger) return [];
		return groupBy(getAllVariableOptions(nodes, trigger, referenceFormulas), (o) => o.group);
	}, [nodes, trigger, referenceFormulas]);
	const functionGroups = useMemo(
		() => groupBy(FORMULA_FUNCTIONS, (fn) => fn.category),
		[]
	);

	function insertAtCursor(token: string, cursorOffset?: number) {
		const el = textareaRef.current;
		const start = el?.selectionStart ?? expression.length;
		const end = el?.selectionEnd ?? expression.length;
		const next = expression.slice(0, start) + token + expression.slice(end);
		setExpression(next);
		const cursor = start + (cursorOffset ?? token.length);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(cursor, cursor);
		});
	}

	function handleSave() {
		if (!name.trim()) return;
		try {
			parseFormula(expression);
		} catch (err) {
			setParseError(err instanceof FormulaError ? err.message : "Invalid formula");
			return;
		}
		onSave({
			id: formula?.id ?? generateFormulaId(),
			name: name.trim(),
			returnType,
			expression,
		});
		onOpenChange(false);
	}

	function handleDelete() {
		if (!formula || !onDelete) return;
		onDelete(formula.id);
		onOpenChange(false);
	}

	return (
		<Modal
			isOpen={open}
			onClose={() => onOpenChange(false)}
			title={formula ? "Edit formula" : "New formula"}
			size="2xl"
		>
			<div className="space-y-4">
				<div className="flex items-end gap-3">
					<div className="flex-1 space-y-1.5">
						<Label htmlFor="formula-name">Name</Label>
						<Input
							id="formula-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Days overdue"
							autoFocus
						/>
					</div>
					<div className="w-40 space-y-1.5">
						<Label htmlFor="formula-return-type">Returns</Label>
						<Select
							value={returnType}
							onValueChange={(v) => setReturnType(v as FormulaReturnType)}
						>
							<SelectTrigger id="formula-return-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FORMULA_RETURN_TYPES.map((rt) => (
									<SelectItem key={rt} value={rt}>
										{RETURN_TYPE_LABELS[rt]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
					{/* Expression editor */}
					<div className="space-y-2">
						<Label htmlFor="formula-expression">Expression</Label>
						<Textarea
							id="formula-expression"
							ref={textareaRef}
							value={expression}
							onChange={(e) => setExpression(e.target.value)}
							rows={8}
							spellCheck={false}
							placeholder="ROUND(trigger.record.total * 0.1, 2)"
							className="font-mono text-sm"
						/>
						<p
							aria-live="polite"
							className={cn(
								"text-xs",
								parseError ? "text-destructive" : "text-muted-foreground"
							)}
						>
							{parseError ?? "Looks valid"}
						</p>

						<div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
							<div className="flex items-center justify-between gap-2">
								<span className="text-xs font-medium text-muted-foreground">Preview</span>
								{sampleRecords.length > 1 && (
									<Select value={selectedSample?.entityId} onValueChange={setSampleId}>
										<SelectTrigger className="h-7 w-40 text-xs">
											<SelectValue placeholder="Sample record" />
										</SelectTrigger>
										<SelectContent>
											{sampleRecords.map((r) => (
												<SelectItem key={r.entityId} value={r.entityId}>
													{r.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>
							{sampleRecords.length === 0 && (
								<p className="text-xs text-muted-foreground">
									No sample record yet — previewing with empty values.
								</p>
							)}
							<p
								aria-live="polite"
								className={cn(
									"break-words font-mono text-sm",
									preview && !preview.ok ? "text-destructive" : "text-foreground"
								)}
							>
								{preview ? (preview.ok ? preview.text : preview.message) : "—"}
							</p>
						</div>
					</div>

					{/* Reference */}
					<div className="max-h-[420px] space-y-4 overflow-y-auto rounded-md border border-border p-3">
						<div>
							<div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Variables
							</div>
							{variableGroups.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									Choose a trigger to see available variables.
								</p>
							) : (
								<div className="space-y-3">
									{variableGroups.map(([group, options]) => (
										<div key={group}>
											<div className="mb-1 text-[11px] font-medium text-muted-foreground">
												{group}
											</div>
											<div className="space-y-0.5">
												{options.map((option) => (
													<button
														key={option.path}
														type="button"
														onClick={() => insertAtCursor(`{${option.path}}`)}
														title={option.path}
														className="flex w-full items-center rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													>
														<span className="truncate">{option.label}</span>
													</button>
												))}
											</div>
										</div>
									))}
								</div>
							)}
						</div>

						<div>
							<div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Functions
							</div>
							<div className="space-y-3">
								{functionGroups.map(([category, fns]) => (
									<div key={category}>
										<div className="mb-1 text-[11px] font-medium text-muted-foreground">
											{FUNCTION_CATEGORY_LABELS[category as FormulaFnDoc["category"]]}
										</div>
										<div className="space-y-0.5">
											{fns.map((fn) => (
												<button
													key={fn.name}
													type="button"
													onClick={() => insertAtCursor(`${fn.name}()`, fn.name.length + 1)}
													title={`${fn.description} — e.g. ${fn.example}`}
													className="flex w-full items-center rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												>
													<span className="truncate font-mono text-xs">{fn.signature}</span>
												</button>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>

				<div className="flex items-center justify-between border-t border-border pt-4">
					<div>
						{formula && onDelete && (
							<Button
								intent="outline"
								size="sm"
								onPress={handleDelete}
								className="text-destructive"
							>
								<Trash2 className="h-3.5 w-3.5" />
								Delete
							</Button>
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button intent="outline" size="sm" onPress={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							intent="primary"
							size="sm"
							onPress={handleSave}
							// parseError is debounced (250ms) and only drives the inline
							// message; handleSave re-parses synchronously and blocks an
							// invalid save, so gating disabled on it would spuriously
							// disable Save right after a syntax error is fixed.
							isDisabled={!name.trim()}
						>
							Save
						</Button>
					</div>
				</div>
			</div>
		</Modal>
	);
}

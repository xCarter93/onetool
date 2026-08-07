"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
	DndContext,
	closestCenter,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	restrictToVerticalAxis,
	restrictToParentElement,
} from "@dnd-kit/modifiers";
import { GripVertical, Lock, Package, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { SKUSelector } from "@/components/shared/sku-selector";
import { formatCurrency } from "@/lib/money";
import { cn } from "@/lib/utils";
import { parseTsvRows, type GridLineItem, type LineItemGridController } from "./types";

/** Editable cells per row — description, qty, unit, rate, and cost when shown. */
const CELL_ATTR = "data-line-cell";

function marginToneClass(marginPct: number): string {
	if (marginPct >= 40) return "text-success";
	if (marginPct >= 20) return "text-warning";
	return "text-destructive";
}

function toNumber(raw: string): number {
	const parsed = Number.parseFloat(raw.replace(/[$,\s]/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A single grid cell. Keeps its own draft while focused so typing never
 * round-trips through Convex, and commits on blur or Enter.
 */
function GridCell({
	value,
	onCommit,
	numeric = false,
	placeholder,
	ariaLabel,
	className,
}: {
	value: string;
	onCommit: (next: string) => Promise<boolean>;
	numeric?: boolean;
	placeholder?: string;
	ariaLabel: string;
	className?: string;
}) {
	const [draft, setDraft] = useState(value);
	const [committedValue, setCommittedValue] = useState(value);
	const [focused, setFocused] = useState(false);
	const [sent, setSent] = useState<string | null>(null);

	// Adopt server-side changes without clobbering what the user is typing.
	if (value !== committedValue) {
		setCommittedValue(value);
		setSent(null);
		if (!focused) setDraft(value);
	}

	// Enter commits, then the grid moves focus and the old cell blurs — without
	// the `sent` guard that fires the same mutation twice.
	const commit = async () => {
		if (draft === value || draft === sent) return;
		const attempted = draft;
		setSent(attempted);
		const ok = await onCommit(attempted);
		if (!ok) {
			// Rejected locally or by the server: the stored value never changed,
			// so snap the cell back rather than leave an unsaved number on screen.
			setSent(null);
			setDraft(value);
		}
	};

	return (
		<input
			data-line-cell="true"
			type="text"
			inputMode={numeric ? "decimal" : undefined}
			aria-label={ariaLabel}
			value={draft}
			placeholder={placeholder}
			onChange={(e) => setDraft(e.target.value)}
			onFocus={() => setFocused(true)}
			onBlur={() => {
				setFocused(false);
				void commit();
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") void commit();
				if (e.key === "Escape") {
					setDraft(value);
					e.currentTarget.blur();
				}
			}}
			className={cn(
				"min-w-0 border-0 border-r border-border bg-transparent px-2 text-[13px] text-foreground",
				"focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 focus-visible:bg-background focus-visible:relative focus-visible:z-[2]",
				"placeholder:text-muted-foreground/70",
				numeric && "text-right tabular-nums",
				className
			)}
		/>
	);
}

function ReadonlyCell({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex items-center border-r border-border px-2 text-[13px]",
				className
			)}
		>
			{children}
		</span>
	);
}

interface RowProps {
	item: GridLineItem;
	index: number;
	columns: string;
	selected: boolean;
	locked: boolean;
	showCostMargin: boolean;
	onToggleSelect: (id: string) => void;
	controller: LineItemGridController;
}

function LineItemRow({
	item,
	index,
	columns,
	selected,
	locked,
	showCostMargin,
	onToggleSelect,
	controller,
}: RowProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: item.id, disabled: locked });

	const amount = item.quantity * item.rate;
	const rowCost = item.quantity * (item.cost ?? 0);
	const marginPct = amount > 0 ? ((amount - rowCost) / amount) * 100 : 0;

	const style: CSSProperties = {
		gridTemplateColumns: columns,
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"group/row grid min-h-8 items-stretch border-t border-border",
				"hover:bg-muted/45",
				selected && "bg-primary/[0.07]",
				isDragging && "relative z-20 opacity-80 shadow-lg"
			)}
		>
			{/* Drag handle */}
			<span className="flex items-center justify-center">
				{locked ? null : (
					<button
						type="button"
						aria-label={`Reorder line ${index + 1}`}
						className="flex h-5 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 active:cursor-grabbing"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="h-3.5 w-3.5" />
					</button>
				)}
			</span>

			{/* Select */}
			<span className="flex items-center justify-center border-r border-border">
				<Checkbox
					checked={selected}
					disabled={locked}
					onCheckedChange={() => onToggleSelect(item.id)}
					aria-label={`Select line ${index + 1}`}
					className="size-3.5"
				/>
			</span>

			{/* Row number */}
			<span className="flex items-center justify-center border-r border-border bg-muted/45 text-[11px] text-muted-foreground tabular-nums">
				{index + 1}
			</span>

			{locked ? (
				<>
					<ReadonlyCell className="font-medium">{item.description}</ReadonlyCell>
					<ReadonlyCell className="justify-end tabular-nums">
						{item.quantity}
					</ReadonlyCell>
					<ReadonlyCell className="text-muted-foreground">
						{item.unit ?? ""}
					</ReadonlyCell>
					<ReadonlyCell className="justify-end tabular-nums">
						{formatCurrency(item.rate)}
					</ReadonlyCell>
					{showCostMargin && (
						<ReadonlyCell className="justify-end bg-warning/5 text-muted-foreground tabular-nums">
							{formatCurrency(item.cost ?? 0)}
						</ReadonlyCell>
					)}
				</>
			) : (
				<>
					<GridCell
						ariaLabel={`Description, line ${index + 1}`}
						value={item.description}
						placeholder="Describe the work…"
						onCommit={(next) =>
							controller.patchItem(item.id, { description: next })
						}
					/>
					<GridCell
						ariaLabel={`Quantity, line ${index + 1}`}
						numeric
						value={String(item.quantity)}
						onCommit={(next) =>
							controller.patchItem(item.id, { quantity: toNumber(next) })
						}
						className="px-1.5"
					/>
					<GridCell
						ariaLabel={`Unit, line ${index + 1}`}
						value={item.unit ?? ""}
						placeholder="unit"
						onCommit={(next) => controller.patchItem(item.id, { unit: next })}
						className="px-1.5 text-muted-foreground"
					/>
					<GridCell
						ariaLabel={`Rate, line ${index + 1}`}
						numeric
						value={String(item.rate)}
						onCommit={(next) =>
							controller.patchItem(item.id, { rate: toNumber(next) })
						}
						className="px-1.5"
					/>
					{showCostMargin && (
						<GridCell
							ariaLabel={`Internal cost, line ${index + 1}`}
							numeric
							value={String(item.cost ?? 0)}
							onCommit={(next) =>
								controller.patchItem(item.id, { cost: toNumber(next) })
							}
							className="bg-warning/5 px-1.5 text-muted-foreground"
						/>
					)}
				</>
			)}

			{/* Amount */}
			<span className="flex items-center justify-end border-r border-border px-1.5 text-[13px] font-semibold tabular-nums">
				{formatCurrency(amount)}
			</span>

			{/* Margin */}
			{showCostMargin && (
				<span
					className={cn(
						"flex items-center justify-end border-r border-border px-1.5 text-xs font-semibold tabular-nums",
						marginToneClass(marginPct)
					)}
				>
					{marginPct.toFixed(0)}%
				</span>
			)}

			{/* SKU + row delete */}
			<span className="relative flex items-center justify-center gap-0.5">
				{!locked && (
					<>
						<SKUSelector
							align="end"
							onSelect={(sku) =>
								controller.applySku(item.id, {
									name: sku.name,
									unit: sku.unit,
									rate: sku.rate,
									cost: sku.cost,
								})
							}
							trigger={
								<button
									type="button"
									title="Fill this row from the SKU catalog"
									aria-label={`Fill line ${index + 1} from the SKU catalog`}
									className="inline-flex h-[19px] shrink-0 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10.5px] font-semibold tracking-[0.02em] text-muted-foreground transition-colors hover:border-primary/45 hover:bg-primary/[0.08] hover:text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 data-[popup-open]:border-primary/45 data-[popup-open]:bg-primary/10 data-[popup-open]:text-primary"
								>
									<Package className="h-2.5 w-2.5" />
									SKU
								</button>
							}
						/>
						<button
							type="button"
							onClick={() => controller.removeItems([item.id])}
							title="Remove line"
							aria-label={`Remove line ${index + 1}`}
							className="absolute -right-6 inline-flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
						>
							<Trash2 className="h-3 w-3" />
						</button>
					</>
				)}
			</span>
		</div>
	);
}

export interface LineItemGridProps {
	controller: LineItemGridController;
	/** Render skeleton rows while the line items query resolves. */
	isLoading?: boolean;
	/**
	 * Put the caret in row 1's description once the data lands, adding the first
	 * row when there is none. Runs at most once per mount.
	 */
	autoFocusFirstRow?: boolean;
	/**
	 * Edge-to-edge mode for a dense Frame panel: drops the outer radius and the
	 * side borders so the grid hairlines meet the panel edges.
	 */
	bare?: boolean;
	/**
	 * Render the keyboard-hint bar under the grid. Off when the surface places
	 * `LineItemGridHints` itself (the frame layout puts it above the frame).
	 */
	showHints?: boolean;
	/**
	 * Controlled row selection. When provided, the surface owns the selection
	 * and the grid renders no floating action bar — it expects the host to
	 * present the actions (the frame layout puts them in its header).
	 */
	selectedIds?: string[];
	onSelectionChange?: (ids: string[]) => void;
}

export function LineItemGrid({
	controller,
	isLoading = false,
	autoFocusFirstRow = false,
	bare = false,
	showHints = true,
	selectedIds: controlledSelectedIds,
	onSelectionChange,
}: LineItemGridProps) {
	const { items, locked, showCostMargin } = controller;
	const gridRef = useRef<HTMLDivElement>(null);
	const isControlled = controlledSelectedIds !== undefined;
	const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
	const selectedIds = controlledSelectedIds ?? internalSelectedIds;
	const focusNewRowRef = useRef(false);
	const rowCountRef = useRef(items.length);
	const autoFocusedRef = useRef(false);

	const columns = useMemo(() => {
		const cost = showCostMargin ? " 82px" : "";
		const margin = showCostMargin ? " 54px" : "";
		return `24px 30px 26px minmax(0,1fr) 58px 62px 84px${cost} 96px${margin} 58px`;
	}, [showCostMargin]);

	// Selection can only reference rows that still exist.
	const selected = useMemo(
		() => selectedIds.filter((id) => items.some((item) => item.id === id)),
		[selectedIds, items]
	);
	const allSelected = items.length > 0 && selected.length === items.length;

	const setSelection = useCallback(
		(next: string[]) => {
			if (isControlled) onSelectionChange?.(next);
			else setInternalSelectedIds(next);
		},
		[isControlled, onSelectionChange]
	);

	const toggleSelect = useCallback(
		(id: string) => {
			setSelection(
				selected.includes(id)
					? selected.filter((x) => x !== id)
					: [...selected, id]
			);
		},
		[selected, setSelection]
	);

	const visibleCells = useCallback((scope: HTMLElement): HTMLInputElement[] => {
		return Array.from(
			scope.querySelectorAll<HTMLInputElement>(`input[${CELL_ATTR}]`)
		).filter((el) => el.offsetParent !== null);
	}, []);

	// Focus the first cell of a row appended by Enter / "New row".
	useEffect(() => {
		const grew = items.length > rowCountRef.current;
		rowCountRef.current = items.length;
		if (!grew || !focusNewRowRef.current || !gridRef.current) return;
		focusNewRowRef.current = false;
		const cells = visibleCells(gridRef.current);
		const perRow = showCostMargin ? 5 : 4;
		const target = cells[(items.length - 1) * perRow];
		target?.focus();
		target?.select();
	}, [items.length, showCostMargin, visibleCells]);

	const addRow = useCallback(
		async (focusIt: boolean) => {
			if (locked) return;
			focusNewRowRef.current = focusIt;
			await controller.addItem();
		},
		[controller, locked]
	);

	// Opt-in entry focus (e.g. straight out of the new-quote dialog). The ref
	// latches before the async add so a re-render can't fire it twice; an empty
	// grid rides the addRow path, which already focuses the row it appends.
	useEffect(() => {
		if (!autoFocusFirstRow || autoFocusedRef.current || isLoading || locked) {
			return;
		}
		autoFocusedRef.current = true;
		if (items.length === 0) {
			void addRow(true);
			return;
		}
		const grid = gridRef.current;
		if (!grid) return;
		const target = visibleCells(grid)[0];
		target?.focus();
		target?.select();
	}, [autoFocusFirstRow, isLoading, locked, items.length, addRow, visibleCells]);

	const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const input = event.target as HTMLInputElement | null;
		if (!input || input.tagName !== "INPUT" || !input.hasAttribute(CELL_ATTR)) {
			return;
		}
		const grid = event.currentTarget;
		const cells = visibleCells(grid);
		const i = cells.indexOf(input);
		if (i < 0) return;

		const perRow = showCostMargin ? 5 : 4;
		const lastRow = Math.floor((cells.length - 1) / perRow);
		const row = Math.floor(i / perRow);
		const col = i % perRow;

		// A non-collapsed selection means the cell was reached by keyboard —
		// both edges count, so the next arrow press leaves the cell.
		const start = input.selectionStart;
		const end = input.selectionEnd;
		const noCaret = start === null || end === null;
		const collapsed = !noCaret && start === end;
		const atStart = noCaret || !collapsed || start === 0;
		const atEnd = noCaret || !collapsed || end === input.value.length;

		const go = (index: number) => {
			const target = cells[index];
			if (!target) return;
			event.preventDefault();
			target.focus();
			target.select();
		};

		if (event.key === "ArrowRight" && atEnd && col < perRow - 1) return go(i + 1);
		if (event.key === "ArrowLeft" && atStart && col > 0) return go(i - 1);
		if (event.key === "ArrowDown") return go(i + perRow);
		if (event.key === "ArrowUp") return go(i - perRow);
		if (event.key === "Enter") {
			event.preventDefault();
			if (row < lastRow) return go(i + perRow);
			void addRow(true);
		}
	};

	const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
		if (locked) return;
		const text = event.clipboardData.getData("text/plain");
		// Single-cell paste stays native; only spreadsheet-shaped text becomes rows.
		if (!text || (!text.includes("\t") && !/\r|\n/.test(text.trim()))) return;
		const rows = parseTsvRows(text);
		if (rows.length === 0) return;
		event.preventDefault();
		void controller.bulkAddRows(rows);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const ids = items.map((item) => item.id);
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from < 0 || to < 0) return;
		const next = [...ids];
		next.splice(to, 0, next.splice(from, 1)[0]);
		void controller.reorderItems(next);
	};

	if (isLoading) {
		return (
			<div
				className={cn(
					"overflow-hidden bg-background",
					bare ? "border-y border-border" : "rounded-md border border-border"
				)}
				aria-busy="true"
			>
				<div
					className="grid h-[30px] items-center bg-muted"
					style={{ gridTemplateColumns: columns }}
				/>
				{[0, 1, 2].map((row) => (
					<div
						key={row}
						className="grid min-h-8 items-center border-t border-border px-2"
						style={{ gridTemplateColumns: columns }}
					>
						<span />
						<span />
						<span />
						<Skeleton className="mr-2 h-3 w-3/4" />
						<Skeleton className="h-3 w-6 justify-self-end" />
						<Skeleton className="h-3 w-8" />
						<Skeleton className="h-3 w-10 justify-self-end" />
						{showCostMargin && <Skeleton className="h-3 w-10 justify-self-end" />}
						<Skeleton className="h-3 w-14 justify-self-end" />
						{showCostMargin && <Skeleton className="h-3 w-8 justify-self-end" />}
						<span />
					</div>
				))}
			</div>
		);
	}

	const headerCell = "flex h-full items-center border-r border-border px-1.5";

	return (
		<div>
			{locked && controller.lockedReason && (
				<div
					className={cn(
						"flex items-start gap-2 border border-border bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground",
						bare ? "mx-3 mt-3 mb-2 rounded-md" : "mb-3 rounded-md"
					)}
				>
					<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{controller.lockedReason}</span>
				</div>
			)}

			<div
				ref={gridRef}
				onKeyDown={handleGridKeyDown}
				onPaste={handlePaste}
				className={cn(
					"bg-background tabular-nums",
					bare ? "border-y border-border" : "rounded-md border border-border"
				)}
			>
				{/* Header */}
				<div
					className="grid h-[30px] items-center bg-muted text-[11.5px] font-semibold tracking-[0.02em] text-muted-foreground"
					style={{ gridTemplateColumns: columns }}
				>
					<span />
					<span className="flex h-full items-center justify-center border-r border-border">
						<Checkbox
							checked={allSelected}
							indeterminate={selected.length > 0 && !allSelected}
							disabled={locked || items.length === 0}
							onCheckedChange={() =>
								setSelection(allSelected ? [] : items.map((item) => item.id))
							}
							aria-label={allSelected ? "Deselect all lines" : "Select all lines"}
							className="size-3.5"
						/>
					</span>
					<span className="flex h-full items-center justify-center border-r border-border">
						#
					</span>
					<span className={cn(headerCell, "px-2")}>Description</span>
					<span className={cn(headerCell, "justify-end")}>Qty</span>
					<span className={headerCell}>Unit</span>
					<span className={cn(headerCell, "justify-end")}>Rate</span>
					{showCostMargin && (
						<span className={cn(headerCell, "justify-end")}>Cost</span>
					)}
					<span className={cn(headerCell, "justify-end")}>Amount</span>
					{showCostMargin && (
						<span className={cn(headerCell, "justify-end")}>Margin</span>
					)}
					<span className="flex h-full items-center justify-center">SKU</span>
				</div>

				{/* Rows */}
				<DndContext
					collisionDetection={closestCenter}
					modifiers={[restrictToVerticalAxis, restrictToParentElement]}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={items.map((item) => item.id)}
						strategy={verticalListSortingStrategy}
					>
						{items.map((item, index) => (
							<LineItemRow
								key={item.id}
								item={item}
								index={index}
								columns={columns}
								selected={selected.includes(item.id)}
								locked={locked}
								showCostMargin={showCostMargin}
								onToggleSelect={toggleSelect}
								controller={controller}
							/>
						))}
					</SortableContext>
				</DndContext>

				{items.length === 0 && !locked && (
					<p className="border-t border-border px-3 py-4 text-[13px] text-muted-foreground">
						No lines yet — add the first one below, or paste rows straight from a
						spreadsheet.
					</p>
				)}

				{/* New row footer */}
				{!locked && (
					<button
						type="button"
						onClick={() => void addRow(true)}
						className={cn(
							"flex h-[30px] w-full items-center gap-2 border-0 border-t border-border bg-muted/35 px-2.5",
							"text-left text-[12.5px] text-muted-foreground transition-colors hover:text-primary",
							"focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2",
							!bare && "rounded-b-md"
						)}
					>
						<Plus className="h-3 w-3" />
						New row
					</button>
				)}
			</div>

			{showHints && !locked && (
				<LineItemGridHints className={bare ? "px-3 pt-2.5 pb-0.5" : "mt-2.5"} />
			)}

			{/* Floating selection bar — uncontrolled mode only; a controlled host
			    renders its own action group (see SelectionActions). */}
			{!isControlled && selected.length > 0 && !locked && (
				<div className="sticky bottom-3 z-[15] mt-3 flex justify-center">
					<div className="flex items-center gap-2.5 rounded-[10px] bg-foreground py-2 pl-3.5 pr-2.5 text-background shadow-lg duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none">
						<span className="text-[13px] font-medium">
							{selected.length} {selected.length === 1 ? "line" : "lines"}{" "}
							selected
						</span>
						<span className="h-[18px] w-px bg-background/25" />
						<button
							type="button"
							onClick={() => {
								void controller.duplicateItems(selected);
								setSelection([]);
							}}
							className="inline-flex h-[26px] items-center gap-1.5 rounded-md bg-background/15 px-2.5 text-[12.5px] transition-colors hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-background"
						>
							Duplicate
						</button>
						<button
							type="button"
							onClick={() => {
								void controller.removeItems(selected);
								setSelection([]);
							}}
							className="inline-flex h-[26px] items-center gap-1.5 rounded-md bg-destructive px-2.5 text-[12.5px] text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-background"
						>
							<Trash2 className="h-3 w-3" />
							Delete
						</button>
						<button
							type="button"
							onClick={() => setSelection([])}
							className="h-[26px] rounded-md px-2 text-[12.5px] text-background/65 transition-colors hover:text-background focus-visible:outline-2 focus-visible:outline-background"
						>
							Clear
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

/** Keyboard affordances for the grid. Rendered under it, or above the frame. */
export function LineItemGridHints({ className }: { className?: string }) {
	const chip = "rounded border border-border px-1.5 py-px font-mono";
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground",
				className
			)}
		>
			<span className="flex items-center gap-1.5">
				<kbd className={chip}>← ↑ ↓ →</kbd>
				move between cells
			</span>
			<span className="flex items-center gap-1.5">
				<kbd className={chip}>⏎</kbd>
				next row, or a new one at the end
			</span>
			<span className="flex items-center gap-1.5">
				<kbd className={chip}>⌘V</kbd>
				paste rows from a spreadsheet
			</span>
			<span className="flex items-center gap-1.5">
				<kbd className="rounded border border-border px-1.5 py-px text-[10.5px] font-semibold">
					SKU
				</kbd>
				fill a row from the catalog
			</span>
		</div>
	);
}

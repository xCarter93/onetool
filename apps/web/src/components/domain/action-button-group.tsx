"use client";

import * as React from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { type VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

/**
 * Placement priority within the group:
 * - "start": pinned left, always a visible button (the primary action)
 * - "end": pinned right, always a visible button (destructive/terminal action)
 * - "secondary" (default): a utility action. When a `start` action anchors the
 *   group, secondaries hide behind the ⋯ menu ("pin loud, hide utilities");
 *   otherwise they stay visible up to `maxVisible`, with any excess overflowing.
 */
export type RecordActionSlot = "start" | "secondary" | "end";

export interface RecordAction {
	/** Stable key for React lists. */
	key: string;
	label: string;
	icon?: React.ReactNode;
	onClick?: () => void;
	/** Visual style, preserved whether the action renders as a button or a menu row. Default "outline". */
	variant?: ButtonVariant;
	slot?: RecordActionSlot;
	disabled?: boolean;
	/** Shown as muted subtext on a disabled overflow row (best-effort title on a disabled button). */
	disabledReason?: string;
	/** Shows a spinner and disables the action. */
	loading?: boolean;
	/** Label to show while `loading` (e.g. "Converting…"). Falls back to `label`. */
	loadingLabel?: string;
	/** Omit the action entirely (e.g. status-gated). */
	hidden?: boolean;
	/**
	 * Escape hatch for actions that must supply their own trigger element — e.g. a
	 * component that wraps a Button to open a sheet or popover. The node must render
	 * a Button so it carries `data-slot` and joins the group. Node actions stay
	 * visible: they can't be represented as a plain overflow-menu row.
	 */
	node?: React.ReactNode;
}

export interface ActionButtonGroupProps {
	actions: RecordAction[];
	/** Button size for the whole group. Default "sm". */
	size?: ButtonSize;
	/**
	 * When a `start` action is present, collapse secondary actions into the ⋯ menu
	 * once there are at least this many. A lone secondary stays inline — a one-item
	 * menu is worse UX. Default 2.
	 */
	collapseSecondaryAt?: number;
	/**
	 * Max visible segments (buttons + ⋯ trigger) when there is no `start` action to
	 * pin the group. Excess secondaries overflow into the ⋯ menu. Default 4.
	 */
	maxVisible?: number;
	className?: string;
	/** Accessible label for the overflow trigger. Default "More actions". */
	overflowLabel?: string;
}

function actionSlot(action: RecordAction): RecordActionSlot {
	return action.slot ?? "secondary";
}

function renderInline(action: RecordAction, size: ButtonSize) {
	// A node action is its own trigger element; render it verbatim. The Fragment
	// is transparent in the DOM, so the Button inside stays a direct group child.
	if (action.node) {
		return <React.Fragment key={action.key}>{action.node}</React.Fragment>;
	}
	return renderButton(action, size);
}

function renderButton(action: RecordAction, size: ButtonSize) {
	const disabled = action.disabled || action.loading;
	return (
		<Button
			key={action.key}
			variant={action.variant ?? "outline"}
			size={size}
			onClick={action.onClick}
			disabled={disabled}
			title={disabled && action.disabledReason ? action.disabledReason : undefined}
		>
			{action.loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				action.icon
			)}
			{action.loading && action.loadingLabel ? action.loadingLabel : action.label}
		</Button>
	);
}

function renderMenuItem(action: RecordAction) {
	const disabled = action.disabled || action.loading;
	return (
		<DropdownMenuItem
			key={action.key}
			variant={action.variant === "destructive" ? "destructive" : "default"}
			onClick={action.onClick}
			disabled={disabled}
		>
			{action.loading ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : (
				action.icon
			)}
			{/* flex-col so a disabled action can explain itself under its label */}
			<span className="flex flex-col">
				<span>
					{action.loading && action.loadingLabel
						? action.loadingLabel
						: action.label}
				</span>
				{disabled && action.disabledReason ? (
					<span className="text-xs text-muted-foreground">
						{action.disabledReason}
					</span>
				) : null}
			</span>
		</DropdownMenuItem>
	);
}

/**
 * Renders a row of record actions as a single joined button group. The primary
 * ("start") and destructive/terminal ("end") actions stay visible and keep their
 * color. When a primary anchors the group, secondary actions collapse behind a
 * trailing ⋯ menu ("pin loud, hide utilities"); with no primary, secondaries stay
 * visible up to `maxVisible` and only the excess overflows. Compose from
 * `@/components/ui` primitives only.
 */
export function ActionButtonGroup({
	actions,
	size = "sm",
	collapseSecondaryAt = 2,
	maxVisible = 4,
	className,
	overflowLabel = "More actions",
}: ActionButtonGroupProps) {
	const visible = actions.filter((action) => !action.hidden);
	if (visible.length === 0) return null;

	const starts = visible.filter((action) => actionSlot(action) === "start");
	const ends = visible.filter((action) => actionSlot(action) === "end");
	const secondaries = visible.filter(
		(action) => actionSlot(action) === "secondary"
	);
	// Node actions can't collapse into the menu, so they stay inline; only plain
	// onClick secondaries are eligible for the ⋯ overflow.
	const pinnedSecondaries = secondaries.filter((action) => action.node);
	const menuableSecondaries = secondaries.filter((action) => !action.node);

	let inlineMenuable: RecordAction[];
	let overflow: RecordAction[];
	if (starts.length > 0) {
		// A primary anchors the group → hide utilities behind ⋯ (2+ of them).
		const collapse = menuableSecondaries.length >= collapseSecondaryAt;
		inlineMenuable = collapse ? [] : menuableSecondaries;
		overflow = collapse ? menuableSecondaries : [];
	} else {
		// No primary → secondaries are the content. Show up to the cap; reserve a
		// slot for the ⋯ trigger when there's an excess to hold.
		const budget = Math.max(
			0,
			maxVisible - starts.length - ends.length - pinnedSecondaries.length
		);
		if (menuableSecondaries.length > budget) {
			const inlineCount = Math.max(0, budget - 1);
			inlineMenuable = menuableSecondaries.slice(0, inlineCount);
			overflow = menuableSecondaries.slice(inlineCount);
		} else {
			inlineMenuable = menuableSecondaries;
			overflow = [];
		}
	}

	// Node ("bring your own trigger") secondaries always render before plain ones.
	const inlineSecondaries = [...pinnedSecondaries, ...inlineMenuable];
	const overflowSize: ButtonSize = size === "sm" ? "icon-sm" : "icon";

	return (
		<ButtonGroup className={className}>
			{starts.map((action) => renderInline(action, size))}
			{inlineSecondaries.map((action) => renderInline(action, size))}
			{overflow.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								variant="outline"
								size={overflowSize}
								aria-label={overflowLabel}
							>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end" className="min-w-56">
						{overflow.map((action) => renderMenuItem(action))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{ends.map((action) => renderInline(action, size))}
		</ButtonGroup>
	);
}

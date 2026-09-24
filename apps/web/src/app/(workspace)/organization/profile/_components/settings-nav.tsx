"use client";

import * as React from "react";
import { Lock, ShieldCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
	PILL_TAB_CONTAINER,
	PILL_TAB_SEGMENT_ACTIVE,
	PILL_TAB_SEGMENT_INACTIVE,
} from "@/components/shared/pill-tabs";

export interface SettingsNavItem {
	value: string;
	label: string;
	sublabel: string;
	icon: LucideIcon;
	/** Premium-gated: shows a lock and defers to the page's gate on select. */
	locked?: boolean;
}

interface SettingsNavProps {
	items: SettingsNavItem[];
	activeValue: string;
	onSelect: (value: string) => void;
}

/** Vertical nav rail shown on desktop inside the settings shell. */
export function SettingsNavRail({ items, activeValue, onSelect }: SettingsNavProps) {
	return (
		<nav className="hidden flex-col gap-1 rounded-lg border border-border bg-card p-3 lg:flex">
			<p className="px-3 pb-2.5 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				Organization
			</p>
			{items.map((item) => {
				const active = item.value === activeValue;
				const Icon = item.icon;
				return (
					<button
						key={item.value}
						type="button"
						onClick={() => onSelect(item.value)}
						aria-current={active ? "page" : undefined}
						aria-disabled={item.locked || undefined}
						className={cn(
							"relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
							active
								? "bg-primary/10 ring-1 ring-inset ring-primary/25"
								: "hover:bg-muted",
							item.locked && "opacity-70",
						)}
					>
						{active && (
							<span
								aria-hidden
								className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary"
							/>
						)}
						<Icon
							className={cn(
								"size-[18px] shrink-0",
								active ? "text-primary" : "text-muted-foreground",
							)}
						/>
						<span className="flex min-w-0 flex-col">
							<span className="text-sm font-semibold leading-tight">
								{item.label}
							</span>
							<span className="truncate text-xs leading-tight text-muted-foreground">
								{item.sublabel}
							</span>
						</span>
						{item.locked && (
							<Lock
								aria-hidden="true"
								className="ml-auto size-3.5 shrink-0 text-muted-foreground"
							/>
						)}
					</button>
				);
			})}
			<div className="mt-auto border-t border-border px-2 pt-4">
				<div className="flex items-center gap-2.5 px-2 py-1">
					<ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
					<span className="text-xs leading-snug text-muted-foreground">
						Changes sync across your workspace.
					</span>
				</div>
			</div>
		</nav>
	);
}

/** Horizontal chip nav shown on mobile in place of the rail. */
export function SettingsNavChips({ items, activeValue, onSelect }: SettingsNavProps) {
	return (
		<div className="scrollbar-hide overflow-x-auto pb-1 lg:hidden">
			<div className={PILL_TAB_CONTAINER}>
				{items.map((item) => {
					const active = item.value === activeValue;
					const Icon = item.icon;
					return (
						<button
							key={item.value}
							type="button"
							onClick={() => onSelect(item.value)}
							aria-current={active ? "page" : undefined}
							aria-disabled={item.locked || undefined}
							className={cn(
								"flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200",
								active ? PILL_TAB_SEGMENT_ACTIVE : PILL_TAB_SEGMENT_INACTIVE,
							)}
						>
							<Icon className="size-4" />
							{item.label}
							{item.locked && (
								<Lock aria-hidden="true" className="size-3 text-muted-foreground" />
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

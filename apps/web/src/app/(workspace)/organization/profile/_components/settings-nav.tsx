"use client";

import * as React from "react";
import { Lock, ShieldCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

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
		<nav className="hidden flex-col gap-1 rounded-l-2xl border-r border-border bg-linear-to-b from-primary/[0.03] to-transparent p-3.5 lg:flex">
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
							"relative flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors",
							active
								? "bg-primary/10 ring-1 ring-inset ring-primary/25"
								: "hover:bg-muted",
							item.locked && "opacity-70",
						)}
					>
						{active && (
							<span
								aria-hidden
								className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-primary"
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
			<div className="mt-auto p-2 pt-3.5">
				<div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-primary/[0.04] px-3 py-2.5">
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
		<div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 lg:hidden">
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
							"flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
							active
								? "border-primary/30 bg-primary/10 text-primary"
								: "border-border text-muted-foreground hover:bg-muted",
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
	);
}

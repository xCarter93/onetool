"use client";

import { Settings, Palette, CreditCard } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { PlanBadge } from "@/components/layout/plan-badge";
import { useState } from "react";

export function SettingsPopover() {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					className="inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
					aria-label="Settings"
				>
					<Settings className="size-[18px]" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-64 rounded-xl border-border p-0 shadow-xl"
				align="end"
				sideOffset={12}
			>
				<div className="border-b border-border px-4 py-3">
					<p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						Preferences
					</p>
				</div>

				<div className="p-2">
					{/* Theme row */}
					<div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2">
						<span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
							<span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
								<Palette className="size-4" />
							</span>
							Theme
						</span>
						<ThemeSwitcher
							size="sq-sm"
							className="h-8 w-8 border-border/40 hover:border-border/60"
						/>
					</div>

					{/* Plan row */}
					<div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2">
						<span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
							<span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
								<CreditCard className="size-4" />
							</span>
							Plan
						</span>
						<PlanBadge />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

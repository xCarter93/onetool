"use client";

import { Settings } from "lucide-react";
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
					className="flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground transition-all duration-200 hover:ring-2 hover:ring-primary/30"
					aria-label="Settings"
				>
					<Settings className="h-4.5 w-4.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto min-w-[200px] p-3 bg-background border-border shadow-xl"
				align="end"
				sideOffset={12}
			>
				<div className="space-y-3">
					{/* Theme row */}
					<div className="flex items-center justify-between gap-4">
						<span className="text-sm font-medium text-foreground">Theme</span>
						<ThemeSwitcher
							size="sq-sm"
							className="h-8 w-8 border-border/40 hover:border-border/60"
						/>
					</div>

					{/* Divider */}
					<div className="h-px bg-border/60" />

					{/* Plan row */}
					<div className="flex items-center justify-between gap-4">
						<span className="text-sm font-medium text-foreground">Plan</span>
						<PlanBadge />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

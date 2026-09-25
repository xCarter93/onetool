"use client";

import { Settings, Palette, CreditCard } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { PlanBadge } from "@/components/layout/plan-badge";
import { headerIconButtonClass } from "@/components/layout/header-icon-button";

export function SettingsPopover() {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<button
						type="button"
						className={headerIconButtonClass}
						aria-label="Settings"
					/>
				}
			>
				<Settings className="size-[18px]" />
			</PopoverTrigger>
			<PopoverContent
				className="w-64 rounded-lg border-border p-0 shadow-floating"
				align="end"
				sideOffset={12}
			>
				<div className="border-b border-border px-3 py-2">
					<p className="text-[11px] font-semibold uppercase tracking-[0.025em] text-muted-foreground">
						Preferences
					</p>
				</div>

				<div className="p-1.5">
					{/* Theme row */}
					<div className="flex items-center justify-between gap-4 rounded-[4px] px-2 py-1.5">
						<span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
							<span className="flex size-7 items-center justify-center rounded-[4px] bg-accent text-accent-foreground">
								<Palette className="size-4" />
							</span>
							Theme
						</span>
						<ThemeSwitcher
							size="icon-sm"
							className="h-8 w-8 rounded-[4px] border-border hover:border-primary"
						/>
					</div>

					{/* Plan row */}
					<div className="flex items-center justify-between gap-4 rounded-[4px] px-2 py-1.5">
						<span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
							<span className="flex size-7 items-center justify-center rounded-[4px] bg-accent text-accent-foreground">
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

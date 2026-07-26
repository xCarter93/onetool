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
							size="icon-sm"
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

"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Monitor, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "system", label: "System", Icon: Monitor },
	{ value: "dark", label: "Dark", Icon: Moon },
] as const;

export function PortalThemeSwitcher({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const active = mounted ? (theme ?? "system") : "system";

	return (
		<div
			role="radiogroup"
			aria-label="Theme"
			className={cn(
				"inline-flex w-full items-center rounded-lg border border-border bg-background p-0.5",
				className,
			)}
		>
			{OPTIONS.map(({ value, label, Icon }) => {
				const isActive = active === value;
				return (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={isActive}
						aria-label={label}
						title={label}
						onClick={() => setTheme(value)}
						className={cn(
							"flex h-7 flex-1 items-center justify-center rounded-md transition-colors",
							isActive
								? "bg-muted text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				);
			})}
		</div>
	);
}

export function PortalThemeIconButton({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const current = mounted ? (theme ?? "system") : "system";
	const next =
		current === "light" ? "dark" : current === "dark" ? "system" : "light";
	const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
	const label =
		current === "light"
			? "Theme: light. Switch to dark."
			: current === "dark"
				? "Theme: dark. Switch to system."
				: "Theme: system. Switch to light.";

	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={() => setTheme(next)}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<Icon className="h-[18px] w-[18px]" aria-hidden="true" />
		</button>
	);
}

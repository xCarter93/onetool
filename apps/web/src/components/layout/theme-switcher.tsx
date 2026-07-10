"use client";

import { IconMoon, IconSun } from "@intentui/icons";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

export function ThemeSwitcher({
	...props
}: React.ComponentProps<typeof Button>) {
	const { resolvedTheme, setTheme } = useTheme();
	// true on the client, false during SSR/first render — avoids hydration mismatch
	const mounted = useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);

	const toggleTheme = () => {
		const nextTheme = resolvedTheme === "light" ? "dark" : "light";
		setTheme(nextTheme);
	};

	if (!mounted) return null;

	return (
		<Button
			variant="outline"
			size="icon-lg"
			aria-label="Switch theme"
			onClick={toggleTheme}
			{...props}
		>
			{resolvedTheme === "light" ? <IconSun /> : <IconMoon />}
		</Button>
	);
}

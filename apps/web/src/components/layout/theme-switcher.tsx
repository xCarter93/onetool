"use client";

import { IconMoon, IconSun } from "@intentui/icons";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeSwitcher({
	...props
}: React.ComponentProps<typeof Button>) {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const toggleTheme = () => {
		const nextTheme = resolvedTheme === "light" ? "dark" : "light";
		setTheme(nextTheme);
	};

	if (!mounted) return null;

	return (
		<Button
			intent="outline"
			size="sq-lg"
			aria-label="Switch theme"
			onPress={toggleTheme}
			onClick={toggleTheme}
			{...props}
		>
			{resolvedTheme === "light" ? <IconSun /> : <IconMoon />}
		</Button>
	);
}

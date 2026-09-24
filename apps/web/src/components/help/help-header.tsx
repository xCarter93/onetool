import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { Button } from "@/components/ui/button";
import { HelpSearchButton } from "./help-search";

export function HelpHeader() {
	return (
		<header className="sticky top-0 z-40 w-full border-b border-border bg-background">
			<div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<div className="flex min-w-0 items-center gap-3">
					<Link
						href="/"
						className="shrink-0 transition-opacity hover:opacity-80"
					>
						<Image
							src="/OneTool.png"
							alt="OneTool"
							width={140}
							height={140}
							className="w-[120px] rounded-md dark:brightness-0 dark:invert sm:w-[140px]"
						/>
					</Link>
					<span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
					<Link
						href="/help"
						className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
					>
						Help Center
					</Link>
				</div>

				<div className="flex items-center gap-2">
					<HelpSearchButton />
					<ThemeSwitcher />
					<Link
						// optional catch-all route; bare path isn't in the typed union
						href={"/sign-in" as Route}
						className="hidden px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
					>
						Sign in
					</Link>
					<span className="hidden md:block">
						<Button nativeButton={false} render={<Link href={"/sign-up" as Route} />} size="lg" style={{ height: 40, fontSize: 14 }}>
							Get started
						</Button>
					</span>
				</div>
			</div>
		</header>
	);
}

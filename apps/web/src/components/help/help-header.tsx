import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { CtaButton } from "@/app/components/landing/cta-button";
import { HelpSearchButton } from "./help-search";

export function HelpHeader() {
	return (
		<header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
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
						href="/sign-in"
						className="hidden px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
					>
						Sign in
					</Link>
					<span className="hidden md:block">
						<CtaButton href="/sign-up" size="sm" showArrow={false}>
							Get started
						</CtaButton>
					</span>
				</div>
			</div>
		</header>
	);
}

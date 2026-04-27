"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { FileText, ReceiptText, LogOut } from "lucide-react";
import { BrandHeader } from "./brand-header";
import { PoweredByOneTool } from "./powered-by-onetool";
import { MobileTabBar } from "./mobile-tab-bar";

const NAV_ITEMS = [
	{ key: "quotes", label: "Quotes", icon: FileText, segment: "quotes" },
	{
		key: "invoices",
		label: "Invoices",
		icon: ReceiptText,
		segment: "invoices",
	},
] as const;

export function PortalShell({
	clientPortalId,
	logoUrl,
	businessName,
	logoInvertInDarkMode,
	children,
}: {
	clientPortalId: string;
	logoUrl: string | null;
	businessName: string;
	logoInvertInDarkMode?: boolean;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleSignOut() {
		startTransition(async () => {
			try {
				await fetch("/api/portal/logout", {
					method: "POST",
					credentials: "same-origin",
				});
			} finally {
				router.push(`/portal/c/${clientPortalId}/signed-out`);
			}
		});
	}

	return (
		<div className="min-h-screen flex flex-col md:flex-row">
			<a
				href="#portal-main"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:rounded-md"
			>
				Skip to main content
			</a>

			{/* Desktop sidebar (>=768px) */}
			<aside
				className="hidden md:flex md:w-[248px] md:flex-col bg-sidebar border-r border-border"
				aria-label="Portal navigation"
			>
				<div className="p-4">
					<BrandHeader
						logoUrl={logoUrl}
						businessName={businessName}
						logoInvertInDarkMode={logoInvertInDarkMode}
					/>
				</div>
				<nav className="flex-1 px-2 py-2 flex flex-col gap-1">
					{NAV_ITEMS.map(({ key, label, icon: Icon, segment }) => {
						const href = `/portal/c/${clientPortalId}/${segment}`;
						const active = pathname?.startsWith(href);
						return (
							<Link
								key={key}
								href={href}
								// Tailwind v4 opacity modifier (bg-primary/10) is parser-safe vs
								// arbitrary color-mix utilities which had inconsistent support.
								className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
									active
										? "bg-primary/10 text-primary font-semibold border-l-[3px] border-primary"
										: "text-muted-foreground font-normal hover:bg-muted hover:text-foreground"
								}`}
								aria-current={active ? "page" : undefined}
							>
								<Icon className="h-4 w-4" aria-hidden="true" />
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="p-2">
					<button
						type="button"
						onClick={handleSignOut}
						disabled={pending}
						className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
					>
						<LogOut className="h-4 w-4" aria-hidden="true" />
						Sign out
					</button>
				</div>
				<div className="p-4 border-t border-border">
					<PoweredByOneTool />
				</div>
			</aside>

			{/* Mobile brand header (<768px) */}
			<header className="md:hidden sticky top-0 z-30 bg-card border-b border-border h-14 px-4 flex items-center">
				<BrandHeader
					logoUrl={logoUrl}
					businessName={businessName}
					logoInvertInDarkMode={logoInvertInDarkMode}
				/>
			</header>

			<main
				id="portal-main"
				className="flex-1 px-6 py-6 md:px-9 md:py-6 pb-20 md:pb-6"
			>
				{children}
			</main>

			{/* Mobile tab bar (<768px) */}
			<MobileTabBar
				clientPortalId={clientPortalId}
				onSignOut={handleSignOut}
				signOutPending={pending}
			/>
		</div>
	);
}

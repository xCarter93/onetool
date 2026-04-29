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

	// Gap 4 (Plan 14-08): suppress MobileTabBar on /portal/c/{id}/quotes/{quoteId}
	// because the docked ApprovalBottomSheet (z-40) owns the bottom edge there.
	// The sticky header on the detail page provides a "Back" link, so primary
	// navigation is still reachable. List/invoices routes keep the tab bar.
	const isQuoteDetail = !!pathname?.match(
		/^\/portal\/c\/[^/]+\/quotes\/[^/]+\/?$/,
	);

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
				className="hidden md:flex md:w-[260px] md:flex-col bg-sidebar border-r border-border"
				aria-label="Portal navigation"
			>
				<div className="px-5 pt-6 pb-5">
					<BrandHeader
						logoUrl={logoUrl}
						businessName={businessName}
						logoInvertInDarkMode={logoInvertInDarkMode}
						showEyebrow
					/>
				</div>
				<nav className="flex-1 px-3 py-1 flex flex-col gap-1">
					{NAV_ITEMS.map(({ key, label, icon: Icon, segment }) => {
						const href = `/portal/c/${clientPortalId}/${segment}`;
						const active = pathname?.startsWith(href);
						return (
							<Link
								key={key}
								href={href}
								className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
									active
										? "bg-primary/10 text-primary font-semibold"
										: "text-muted-foreground font-medium hover:bg-muted hover:text-foreground"
								}`}
								aria-current={active ? "page" : undefined}
							>
								<Icon
									className={`h-[18px] w-[18px] ${active ? "" : "opacity-80"}`}
									aria-hidden="true"
								/>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="px-3 pb-3">
					<button
						type="button"
						onClick={handleSignOut}
						disabled={pending}
						className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
					>
						<LogOut className="h-[18px] w-[18px] opacity-80" aria-hidden="true" />
						Sign out
					</button>
				</div>
				<div className="px-5 py-4 border-t border-border">
					<PoweredByOneTool size="compact" />
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

			{/* Mobile tab bar (<768px) — suppressed on quote-detail route (Gap 4) */}
			{!isQuoteDetail && (
				<MobileTabBar
					clientPortalId={clientPortalId}
					onSignOut={handleSignOut}
					signOutPending={pending}
				/>
			)}
		</div>
	);
}

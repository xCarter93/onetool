"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ReceiptText, LogOut } from "lucide-react";

export function MobileTabBar({
	clientPortalId,
	onSignOut,
	signOutPending,
}: {
	clientPortalId: string;
	onSignOut: () => void;
	signOutPending: boolean;
}) {
	const pathname = usePathname();
	const tabs = [
		{
			key: "quotes",
			label: "Quotes",
			icon: FileText,
			href: `/portal/c/${clientPortalId}/quotes`,
		},
		{
			key: "invoices",
			label: "Invoices",
			icon: ReceiptText,
			href: `/portal/c/${clientPortalId}/invoices`,
		},
	];
	return (
		<nav
			aria-label="Portal navigation"
			className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border flex items-stretch h-14 pb-[env(safe-area-inset-bottom)]"
		>
			{tabs.map(({ key, label, icon: Icon, href }) => {
				const active = pathname?.startsWith(href);
				return (
					<Link
						key={key}
						href={href}
						className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-xs min-h-[44px] ${
							active
								? "text-primary font-semibold"
								: "text-muted-foreground font-normal"
						}`}
						aria-current={active ? "page" : undefined}
					>
						<Icon className="h-5 w-5" aria-hidden="true" />
						{label}
					</Link>
				);
			})}
			<button
				type="button"
				onClick={onSignOut}
				disabled={signOutPending}
				className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground font-normal min-h-[44px] disabled:opacity-50"
			>
				<LogOut className="h-5 w-5" aria-hidden="true" />
				Sign out
			</button>
		</nav>
	);
}

import type { Metadata } from "next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpFooter } from "@/components/help/help-footer";
import { HelpHeader } from "@/components/help/help-header";
import { HelpSearchProvider } from "@/components/help/help-search";
import { HelpMobileNav, HelpSidebarNav } from "@/components/help/help-sidebar";

export const metadata: Metadata = {
	title: {
		default: "OneTool Help Center",
		template: "%s | OneTool Help",
	},
	description:
		"Guides and answers for every part of OneTool, the business management platform for field service teams.",
};

export default function HelpLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<HelpSearchProvider>
			<div className="flex min-h-screen flex-col bg-background">
				<HelpHeader />
				<div className="mx-auto flex w-full max-w-7xl flex-1 gap-10 px-4 sm:px-6 lg:px-8">
					<aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 lg:block">
						<ScrollArea className="h-full py-10 pr-3">
							<HelpSidebarNav />
						</ScrollArea>
					</aside>
					<main className="min-w-0 flex-1 pb-20">
						<HelpMobileNav />
						{children}
					</main>
				</div>
				<HelpFooter />
			</div>
		</HelpSearchProvider>
	);
}

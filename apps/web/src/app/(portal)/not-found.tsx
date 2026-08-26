import Image from "next/image";
import { SearchX } from "lucide-react";
import { SecuredByOneTool } from "@/components/portal/powered-by-onetool";

/**
 * Catches `notFound()` anywhere under the portal (bad portal id, unknown quote
 * or invoice). Deliberately quiet: the visitor is a client of some business,
 * so no workspace links and no marketing — just point them back to their link.
 */
export default function PortalNotFound() {
	return (
		<div className="flex min-h-screen flex-col bg-card">
			<header className="flex items-center justify-between px-6 py-5 md:px-12">
				<div className="flex items-center gap-2">
					<Image
						src="/OneTool-mark.png"
						alt=""
						width={296}
						height={296}
						sizes="32px"
						className="size-8 dark:invert dark:brightness-0"
						aria-hidden="true"
					/>
					<span className="text-sm font-semibold">OneTool</span>
				</div>
			</header>

			<main className="flex flex-1 items-center justify-center px-6 py-10">
				<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
						<SearchX
							className="h-7 w-7 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<h1 className="text-[26px] font-semibold tracking-[-0.02em]">
							We couldn&apos;t find that page
						</h1>
						<p className="text-sm text-muted-foreground">
							This link may be incorrect or no longer active. Please use
							the link from your most recent email, or contact the
							business that sent it.
						</p>
					</div>

					<SecuredByOneTool className="mt-6" />
				</div>
			</main>
		</div>
	);
}

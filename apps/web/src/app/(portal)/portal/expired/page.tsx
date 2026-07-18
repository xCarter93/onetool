import Image from "next/image";
import { LinkIcon } from "lucide-react";
import { SecuredByOneTool } from "@/components/portal/powered-by-onetool";

export default function PortalExpiredPage() {
	return (
		<div className="flex min-h-screen flex-col bg-card">
			<header className="flex items-center justify-between px-6 py-5 md:px-12">
				<div className="flex items-center gap-2">
					<Image
						src="/OneTool.png"
						alt=""
						width={32}
						height={32}
						className="dark:brightness-0 dark:invert"
						aria-hidden="true"
					/>
					<span className="text-sm font-semibold">OneTool</span>
				</div>
			</header>

			<main className="flex flex-1 items-center justify-center px-6 py-10">
				<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
						<LinkIcon
							className="h-7 w-7 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<h1 className="text-[26px] font-semibold tracking-[-0.02em]">
							This link is no longer valid
						</h1>
						<p className="text-sm text-muted-foreground">
							Please use the link from your most recent email to return to
							the portal.
						</p>
					</div>

					<SecuredByOneTool className="mt-6" />
				</div>
			</main>
		</div>
	);
}

"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Illustration } from "@/components/illustrations";
import { SecuredByOneTool } from "@/components/portal/powered-by-onetool";

export default function PortalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Surface the digest in the console for support correlation; the portal
		// shell intentionally omits PostHog so visitors aren't tracked.
		console.error("[portal] render error", error.digest ?? error.message);
	}, [error]);

	return (
		<div className="flex min-h-screen flex-col bg-card">
			<header className="flex items-center gap-2 px-6 py-5 md:px-12">
				<Image
					src="/OneTool.png"
					alt=""
					width={32}
					height={32}
					className="dark:brightness-0 dark:invert"
					aria-hidden="true"
				/>
				<span className="text-sm font-semibold">OneTool</span>
			</header>

			<main className="flex flex-1 items-center justify-center px-6 py-10">
				<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
					<Illustration name="app-error" size="hero" className="max-w-full" />

					<div className="flex flex-col gap-2">
						<h1 className="text-[26px] font-semibold tracking-[-0.02em]">
							Something went wrong
						</h1>
						<p className="text-sm text-muted-foreground">
							We hit a snag loading this page. Please try again — if it keeps
							happening, use the link from your most recent email.
						</p>
					</div>

					<button
						type="button"
						onClick={() => reset()}
						className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99]"
					>
						Try again
					</button>

					{error.digest ? (
						<p className="font-mono text-[11px] text-muted-foreground">
							Reference: {error.digest}
						</p>
					) : null}
				</div>
			</main>

			<footer className="px-6 py-6 md:px-12">
				<SecuredByOneTool />
			</footer>
		</div>
	);
}

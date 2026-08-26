import Image from "next/image";
import Link from "next/link";

/**
 * Catches `notFound()` for an unpublished or unknown slug. Deliberately
 * unbranded beyond OneTool itself — for a slug we cannot resolve there is no
 * organization to speak for, so the page stays quiet and neutral.
 */
export default function CommunityPageNotFound() {
	return (
		<div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center px-6 py-16 text-center">
			<p className="flex items-center gap-2 text-sm text-muted-foreground">
				<Image
					src="/OneTool-mark.png"
					alt=""
					width={296}
					height={296}
					sizes="20px"
					className="size-5 opacity-70 dark:invert dark:brightness-0"
					aria-hidden="true"
				/>
				Powered by OneTool
			</p>

			<h1 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
				This page isn&apos;t here
			</h1>

			<p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground text-pretty">
				The community page you&apos;re looking for doesn&apos;t exist or is no
				longer published. If someone sent you this link, double-check the
				address.
			</p>

			<Link
				href="/"
				className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				Go to OneTool
			</Link>
		</div>
	);
}

import Image from "next/image";
import { cn } from "@/lib/utils";

export const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

/** Apple's badge, black on paper and white on dark, swapped by the landing tokens. */
export function AppStoreBadge({ className }: { className?: string }) {
	return (
		<a
			href={APP_STORE_URL}
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Download on the App Store"
			className={cn("inline-flex shrink-0 items-center", className)}
		>
			<Image
				src="/app-store-badge-black.svg"
				alt=""
				width={120}
				height={40}
				className="h-full w-auto [display:var(--on-light)]"
			/>
			<Image
				src="/app-store-badge-white.svg"
				alt=""
				width={120}
				height={40}
				className="h-full w-auto [display:var(--on-dark)]"
			/>
		</a>
	);
}

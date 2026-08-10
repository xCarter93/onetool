import Image from "next/image";
import { cn } from "@/lib/utils";

interface HeroBackdropProps {
	bannerUrl: string;
	/** Carries the height — the backdrop has no intrinsic one. */
	className?: string;
}

/**
 * The owner's banner as atmosphere rather than a picture: washed back and faded
 * into the page background so the hero's text sits on the page, never in a box
 * over an image. Decorative, so it is hidden from assistive tech entirely.
 */
export function HeroBackdrop({ bannerUrl, className }: HeroBackdropProps) {
	return (
		<div
			aria-hidden="true"
			className={cn("absolute inset-x-0 top-0 overflow-hidden", className)}
		>
			<Image
				src={bannerUrl}
				alt=""
				fill
				className="object-cover opacity-15"
				priority
			/>
			<div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
		</div>
	);
}

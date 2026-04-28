import Image from "next/image";

export function BrandHeader({
	logoUrl,
	businessName,
	logoInvertInDarkMode = false,
	showEyebrow = false,
}: {
	logoUrl: string | null;
	businessName: string;
	logoInvertInDarkMode?: boolean;
	showEyebrow?: boolean;
}) {
	const monogram = businessName.charAt(0).toUpperCase();
	return (
		<div className="flex items-center gap-3">
			{logoUrl ? (
				// [Review fix WR-10] Drop `unoptimized` so the logo is fetched
				// + resized by the Next.js image optimizer, which enforces a
				// max source size and content-type via remotePatterns config.
				// An org-supplied logoUrl that 302s to a 50MB image or
				// tracking pixel can no longer be loaded directly by every
				// portal visitor.
				<Image
					src={logoUrl}
					alt={`${businessName} logo`}
					width={44}
					height={44}
					className={`rounded-lg ${logoInvertInDarkMode ? "dark:invert" : ""}`}
				/>
			) : (
				<div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
					{monogram}
				</div>
			)}
			<div className="min-w-0">
				{showEyebrow ? (
					<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
						Customer portal
					</div>
				) : null}
				<div className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
					{businessName}
				</div>
			</div>
		</div>
	);
}

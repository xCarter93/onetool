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
				<Image
					src={logoUrl}
					alt={`${businessName} logo`}
					width={44}
					height={44}
					className={`rounded-lg ${logoInvertInDarkMode ? "dark:invert" : ""}`}
					unoptimized
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

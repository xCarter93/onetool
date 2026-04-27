import Image from "next/image";

export function BrandHeader({
	logoUrl,
	businessName,
	logoInvertInDarkMode = false,
}: {
	logoUrl: string | null;
	businessName: string;
	logoInvertInDarkMode?: boolean;
}) {
	return (
		<div className="flex items-center gap-3">
			{logoUrl ? (
				<Image
					src={logoUrl}
					alt={`${businessName} logo`}
					width={36}
					height={36}
					className={`rounded-md ${logoInvertInDarkMode ? "dark:invert" : ""}`}
					unoptimized
				/>
			) : null}
			<span className="text-sm font-semibold text-foreground">
				{businessName}
			</span>
		</div>
	);
}

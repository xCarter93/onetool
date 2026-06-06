import { Mail } from "lucide-react";
import { BrandHeader } from "./brand-header";

export function PortalContactPanel({
	logoUrl,
	businessName,
	logoInvertInDarkMode,
}: {
	logoUrl: string | null;
	businessName: string;
	logoInvertInDarkMode?: boolean;
}) {
	return (
		<aside aria-label="Your provider" className="flex flex-col gap-4">
			<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
				Your provider
			</p>
			<BrandHeader
				logoUrl={logoUrl}
				businessName={businessName}
				logoInvertInDarkMode={logoInvertInDarkMode}
			/>
			<div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
				<Mail
					className="mt-0.5 h-3.5 w-3.5 shrink-0"
					aria-hidden="true"
				/>
				<p>
					Need something now? Reply to the email this portal link came from to
					reach {businessName} directly.
				</p>
			</div>
			<p className="text-[12px] leading-relaxed text-muted-foreground/80">
				This portal is in addition to — not a replacement for — talking to your
				provider.
			</p>
		</aside>
	);
}

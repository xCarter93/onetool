import { ReactNode } from "react";
import { Shield, ShieldCheck, Award, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustBarProps {
	credentials:
		| {
				isLicensed?: boolean;
				isBonded?: boolean;
				isInsured?: boolean;
				yearEstablished?: number;
				certifications?: string[];
		  }
		| undefined;
	themeClasses: string;
}

export function TrustBar({ credentials, themeClasses }: TrustBarProps) {
	if (!credentials) return null;

	const items: { icon: ReactNode; label: string }[] = [];

	if (credentials.yearEstablished) {
		const years =
			new Date().getFullYear() - credentials.yearEstablished;
		if (years > 0) {
			items.push({
				icon: <Clock className="size-4" />,
				label: `${years} Years in Business`,
			});
		}
	}

	if (credentials.isLicensed) {
		items.push({
			icon: <Shield className="size-4" />,
			label: "Licensed",
		});
	}

	if (credentials.isBonded) {
		items.push({
			icon: <ShieldCheck className="size-4" />,
			label: "Bonded",
		});
	}

	if (credentials.isInsured) {
		items.push({
			icon: <ShieldCheck className="size-4" />,
			label: "Insured",
		});
	}

	credentials.certifications?.forEach((cert) =>
		items.push({
			icon: <Award className="size-4" />,
			label: cert,
		})
	);

	if (items.length === 0) return null;

	return (
		<div className={cn("py-4 px-4", themeClasses)}>
			<div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2">
				{items.map((item, i) => (
					<div
						key={i}
						className="flex items-center gap-1.5 text-sm text-muted-fg"
					>
						<span className="text-success">{item.icon}</span>
						<span>{item.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}

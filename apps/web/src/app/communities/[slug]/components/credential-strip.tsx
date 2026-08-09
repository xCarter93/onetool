import { ShieldCheck, Clock, Award, MapPin } from "lucide-react";
import { OpenToday } from "./open-today";

interface CredentialStripProps {
	credentials?: {
		isLicensed?: boolean;
		isBonded?: boolean;
		isInsured?: boolean;
		yearEstablished?: number;
		certifications?: string[];
	};
	businessHours?: {
		byAppointmentOnly: boolean;
		schedule?: Array<{
			day: string;
			open: string;
			close: string;
			isClosed: boolean;
		}>;
	};
	/** Derived from the org's city/state — there is no service-area field. */
	serviceArea?: string;
	/** The org's IANA timezone, so "Open today" follows the business's day. */
	timezone?: string;
}

/**
 * Scannable trust strip beneath the hero. Deliberately never renders
 * `licenseNumber` — it is excluded from the public payload (PUB-05) and must
 * stay that way.
 */
export function CredentialStrip({
	credentials,
	businessHours,
	serviceArea,
	timezone,
}: CredentialStripProps) {
	const badges: string[] = [];
	if (credentials?.isLicensed) badges.push("Licensed");
	if (credentials?.isBonded) badges.push("bonded");
	if (credentials?.isInsured) badges.push("insured");

	const licenseLabel =
		badges.length > 0
			? badges.length === 1
				? badges[0]
				: `${badges[0]}, ${badges.slice(1).join(" & ")}`
			: null;

	const years = credentials?.yearEstablished
		? new Date().getFullYear() - credentials.yearEstablished
		: 0;

	const certifications = credentials?.certifications?.filter((c) => c.trim()) ?? [];

	const hasAnything =
		licenseLabel ||
		years > 0 ||
		certifications.length > 0 ||
		serviceArea ||
		businessHours?.byAppointmentOnly ||
		businessHours?.schedule?.length;

	if (!hasAnything) return null;

	return (
		<div className="border-y border-border bg-muted/30">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
				<ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-fg">
					{licenseLabel && (
						<li className="inline-flex items-center gap-1.5">
							<ShieldCheck className="size-4 text-success" aria-hidden="true" />
							{licenseLabel}
						</li>
					)}
					{years > 0 && (
						<li className="inline-flex items-center gap-1.5">
							<Clock className="size-4 text-success" aria-hidden="true" />
							{years} {years === 1 ? "year" : "years"} in business
						</li>
					)}
					{certifications.map((cert) => (
						<li key={cert} className="inline-flex items-center gap-1.5">
							<Award className="size-4 text-success" aria-hidden="true" />
							{cert}
						</li>
					))}
					{serviceArea && (
						<li className="inline-flex items-center gap-1.5">
							<MapPin className="size-4 text-success" aria-hidden="true" />
							{serviceArea}
						</li>
					)}
					<li>
						<OpenToday
							schedule={businessHours?.schedule}
							byAppointmentOnly={businessHours?.byAppointmentOnly}
							timezone={timezone}
						/>
					</li>
				</ul>
			</div>
		</div>
	);
}

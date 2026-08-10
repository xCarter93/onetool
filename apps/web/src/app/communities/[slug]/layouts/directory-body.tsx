import Image from "next/image";
import { Award, MapPin, MessageSquare, Phone, ShieldCheck } from "lucide-react";
import { BusinessHoursCard } from "../components/business-hours-card";
import { SocialLinks } from "../components/social-links";
import { OwnerInfo } from "../components/owner-info";
import { OpenToday } from "../components/open-today";
import { CONTACT_FORM_ID } from "../community-page-view";
import { SectionStack, type LayoutBodyProps } from "./layout-body";

/**
 * Directory — a listing, for the owner who has no photographs yet. What sells
 * the business here is that it is real and reachable: hours, credentials,
 * service area and the two ways to make contact, all above the fold and all
 * scannable without scrolling.
 *
 * The mock's service-area map is deliberately not built. A live map on a page
 * cached for every visitor means a Mapbox tile request per view, and the public
 * surface's map exposure is still an open item; the area renders as text from
 * the org address instead.
 */
export function DirectoryBody(props: LayoutBodyProps) {
	const { data, serviceArea, contactForm } = props;

	const serviceTags = data.serviceTags ?? [];
	const certifications = data.credentials?.certifications ?? [];
	const credentialLines: string[] = [];
	if (data.credentials?.isLicensed) credentialLines.push("Licensed");
	if (data.credentials?.isBonded) credentialLines.push("Bonded");
	if (data.credentials?.isInsured) credentialLines.push("Insured");

	const metaLine = [
		serviceArea || null,
		data.credentials?.yearEstablished
			? `Since ${data.credentials.yearEstablished}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	const hasCredentialCell =
		credentialLines.length > 0 || certifications.length > 0;

	return (
		<>
			<section className="border-b border-border">
				<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 text-center">
					{data.avatarUrl ? (
						<Image
							src={data.avatarUrl}
							alt=""
							width={64}
							height={64}
							className="mx-auto size-16 rounded-2xl object-cover ring-1 ring-border"
						/>
					) : null}

					<h1 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-tight text-fg text-balance">
						{data.pageTitle}
					</h1>

					{metaLine && (
						<p className="mt-2 text-sm text-muted-fg">{metaLine}</p>
					)}

					{data.metaDescription && (
						<p className="mt-3 mx-auto max-w-xl text-base leading-relaxed text-muted-fg text-pretty">
							{data.metaDescription}
						</p>
					)}

					<div className="mt-4 flex justify-center">
						<OwnerInfo ownerInfo={data.ownerInfo} />
					</div>

					<div className="mt-6 flex flex-col sm:flex-row sm:justify-center gap-3">
						{data.organization?.phone && (
							<a
								href={`tel:${data.organization.phone}`}
								className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							>
								<Phone className="size-4" aria-hidden="true" />
								Call {data.organization.phone}
							</a>
						)}
						<a
							href={`#${CONTACT_FORM_ID}`}
							className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-fg transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						>
							<MessageSquare className="size-4" aria-hidden="true" />
							Send a message
						</a>
					</div>

					<div className="mt-6 flex justify-center">
						<SocialLinks socialLinks={data.socialLinks} />
					</div>
				</div>
			</section>

			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
				<div className="grid gap-6 sm:grid-cols-2">
					{data.businessHours && (
						<div id="hours" className="scroll-mt-20">
							<div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
								<OpenToday
									schedule={data.businessHours.schedule}
									byAppointmentOnly={data.businessHours.byAppointmentOnly}
									timezone={data.organization?.timezone}
								/>
							</div>
							<BusinessHoursCard
								businessHours={data.businessHours}
								cardClasses="border border-border bg-bg mt-0"
							/>
						</div>
					)}

					{hasCredentialCell && (
						<div className="rounded-xl border border-border bg-bg p-6">
							<h2 className="text-lg font-semibold text-fg">Credentials</h2>
							<ul className="mt-4 space-y-2 text-sm text-muted-fg">
								{credentialLines.length > 0 && (
									<li className="flex items-start gap-2">
										<ShieldCheck
											className="mt-0.5 size-4 shrink-0 text-success"
											aria-hidden="true"
										/>
										<span>{credentialLines.join(" · ")}</span>
									</li>
								)}
								{certifications.map((certification) => (
									<li key={certification} className="flex items-start gap-2">
										<Award
											className="mt-0.5 size-4 shrink-0 text-muted-fg"
											aria-hidden="true"
										/>
										<span className="text-pretty">{certification}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{serviceTags.length > 0 && (
						<div className="sm:col-span-2">
							<h2 className="text-lg font-semibold text-fg">Services</h2>
							<ul className="mt-3 flex flex-wrap gap-2">
								{serviceTags.map((tag) => (
									<li
										key={tag}
										className="rounded-full bg-muted px-3 py-1 text-sm text-fg"
									>
										{tag}
									</li>
								))}
							</ul>
						</div>
					)}

					{serviceArea && (
						<div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-fg">
							<MapPin
								className="mt-0.5 size-4 shrink-0 text-muted-fg"
								aria-hidden="true"
							/>
							<span>
								Serving{" "}
								<span className="font-medium text-fg">{serviceArea}</span> and
								the surrounding area.
							</span>
						</div>
					)}
				</div>

				<SectionStack {...props} className="mt-12 space-y-12 sm:mt-14" />

				<div
					id={CONTACT_FORM_ID}
					className="mt-12 scroll-mt-20 sm:mt-14 max-w-2xl"
				>
					{contactForm}
				</div>
			</div>
		</>
	);
}

import Image from "next/image";
import { ArrowRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { CredentialStrip } from "../components/credential-strip";
import { BusinessHoursCard } from "../components/business-hours-card";
import { SocialLinks } from "../components/social-links";
import { OwnerInfo } from "../components/owner-info";
import { CONTACT_FORM_ID } from "../community-page-view";
import { SectionStack, type LayoutBodyProps } from "./layout-body";

/**
 * Showcase — the default. Photographs of finished work carry the page, so they
 * sit beside the name above the fold instead of waiting halfway down, and the
 * quote form rides along in a sticky rail while the visitor reads.
 */
export function ShowcaseBody(props: LayoutBodyProps) {
	const { data, heroPhotos, serviceArea, contactForm } = props;

	return (
		<>
			{/* Hero — name sits on the page, never in a glass box over the banner */}
			<section className="relative">
				{data.bannerUrl && (
					<div
						aria-hidden="true"
						className="absolute inset-x-0 top-0 h-64 sm:h-80 overflow-hidden"
					>
						<Image
							src={data.bannerUrl}
							alt=""
							fill
							className="object-cover opacity-15"
							priority
						/>
						<div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
					</div>
				)}

				<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-12 sm:pt-14 sm:pb-16">
					<div
						className={cn(
							"grid gap-10",
							heroPhotos.length > 0 &&
								"lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center"
						)}
					>
						<div>
							<h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-fg text-balance">
								{data.pageTitle}
							</h1>

							{data.metaDescription && (
								<p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-fg max-w-xl text-pretty">
									{data.metaDescription}
								</p>
							)}

							<div className="mt-4">
								<OwnerInfo ownerInfo={data.ownerInfo} />
							</div>

							<div className="mt-7 flex flex-wrap items-center gap-3">
								<a
									href={`#${CONTACT_FORM_ID}`}
									className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								>
									Get a free quote
									<ArrowRight className="size-4" aria-hidden="true" />
								</a>
								{data.organization?.phone && (
									<a
										href={`tel:${data.organization.phone}`}
										className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-fg transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
									>
										<Phone className="size-4" aria-hidden="true" />
										{data.organization.phone}
									</a>
								)}
							</div>

							<div className="mt-6">
								<SocialLinks socialLinks={data.socialLinks} />
							</div>
						</div>

						{/* Photos above the fold rather than buried mid-page */}
						{heroPhotos.length > 0 && (
							<div
								className={cn(
									"grid gap-2 sm:gap-3",
									heroPhotos.length === 1 && "grid-cols-1",
									heroPhotos.length === 2 && "grid-cols-2",
									heroPhotos.length >= 3 && "grid-cols-3"
								)}
							>
								<div
									className={cn(
										"relative aspect-4/3 overflow-hidden rounded-2xl ring-1 ring-border bg-muted",
										heroPhotos.length >= 3 && "col-span-2 row-span-2"
									)}
								>
									<Image
										src={heroPhotos[0].url}
										alt={`Recent work by ${data.pageTitle}`}
										fill
										className="object-cover"
										sizes="(max-width: 1024px) 100vw, 26rem"
										priority
									/>
								</div>
								{heroPhotos.slice(1).map((photo) => (
									<div
										key={photo.storageId}
										className={cn(
											"relative overflow-hidden rounded-xl ring-1 ring-border bg-muted",
											heroPhotos.length === 2 ? "aspect-4/3" : "aspect-square"
										)}
									>
										<Image
											src={photo.url}
											alt={`Recent work by ${data.pageTitle}`}
											fill
											className="object-cover"
											sizes="8rem"
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</section>

			<CredentialStrip
				credentials={data.credentials}
				businessHours={data.businessHours}
				serviceArea={serviceArea}
				timezone={data.organization?.timezone}
			/>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
				<div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
					<div className="flex-1 min-w-0">
						<SectionStack {...props} />
					</div>

					<div
						id={CONTACT_FORM_ID}
						className="lg:w-[24rem] xl:w-[26rem] shrink-0 scroll-mt-20"
					>
						<div className="lg:sticky lg:top-20 space-y-6">
							{contactForm}
							<div id="hours" className="scroll-mt-20">
								<BusinessHoursCard
									businessHours={data.businessHours}
									cardClasses="border border-border bg-bg"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

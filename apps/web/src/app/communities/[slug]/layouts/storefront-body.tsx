import { ArrowRight, Phone } from "lucide-react";
import { CredentialStrip } from "../components/credential-strip";
import { BusinessHoursCard } from "../components/business-hours-card";
import { SocialLinks } from "../components/social-links";
import { OwnerInfo } from "../components/owner-info";
import { EmptySectionHint } from "../components/empty-section-hint";
import { CONTACT_FORM_ID } from "../community-page-view";
import { SectionStack, type LayoutBodyProps } from "./layout-body";

/**
 * Storefront — for an owner who sells set plans. Two things a visitor came for
 * sit above everything: what it costs, and how to ask. Pricing is hoisted out
 * of the section flow into a plan row, and the quote form is inline in the main
 * column rather than in a rail, so it is the widest thing on the page.
 *
 * No banner and no hero photography on purpose — this is the layout you pick
 * when the price list is the strongest thing you have.
 */
export function StorefrontBody(props: LayoutBodyProps) {
	const {
		data,
		serviceArea,
		contactForm,
		sectionNodes,
		sectionHasContent,
		orderedSections,
		onEditSection,
	} = props;

	const pricingIsOn = orderedSections.includes("pricing");
	const showPlanRow = pricingIsOn && sectionHasContent.pricing;
	// In the editor an owner needs to see that the layout's loudest slot is
	// empty; a visitor just sees the page start at the form.
	const planRowHint =
		pricingIsOn && !sectionHasContent.pricing && onEditSection
			? onEditSection
			: null;

	return (
		<>
			<section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 sm:pt-14 sm:pb-10">
				<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground text-balance">
					{data.pageTitle}
				</h1>

				{data.metaDescription && (
					<p className="mt-4 max-w-2xl text-lg sm:text-xl leading-relaxed text-muted-foreground text-pretty">
						{data.metaDescription}
					</p>
				)}

				<div className="mt-4">
					<OwnerInfo ownerInfo={data.ownerInfo} />
				</div>

				<div className="mt-7 flex flex-wrap items-center gap-3">
					<a
						href={`#${CONTACT_FORM_ID}`}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						Get a free quote
						<ArrowRight className="size-4" aria-hidden="true" />
					</a>
					{data.organization?.phone && (
						<a
							href={`tel:${data.organization.phone}`}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
						>
							<Phone className="size-4" aria-hidden="true" />
							{data.organization.phone}
						</a>
					)}
				</div>
			</section>

			{(showPlanRow || planRowHint) && (
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14">
					{showPlanRow ? (
						sectionNodes.pricing
					) : (
						<EmptySectionHint sectionId="pricing" onEdit={planRowHint!} />
					)}
				</div>
			)}

			<CredentialStrip
				credentials={data.credentials}
				businessHours={data.businessHours}
				serviceArea={serviceArea}
				timezone={data.organization?.timezone}
			/>

			{/* The form is the page's job. It gets the wide column, and the hours
			    sit beside it so "when can you come" is answered without scrolling. */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
				<div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
					<div id={CONTACT_FORM_ID} className="lg:col-span-7 scroll-mt-20">
						{contactForm}
					</div>
					<div className="lg:col-span-5 space-y-6">
						<div id="hours" className="scroll-mt-20">
							<BusinessHoursCard
								businessHours={data.businessHours}
								cardClasses="border border-border bg-background"
							/>
						</div>
						<SocialLinks socialLinks={data.socialLinks} />
					</div>
				</div>

				<SectionStack
					{...props}
					exclude={["pricing"]}
					className="mt-14 space-y-14 sm:mt-16"
				/>
			</div>
		</>
	);
}

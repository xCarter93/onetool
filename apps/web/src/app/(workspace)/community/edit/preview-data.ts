import type { CommunityPageViewData } from "@/app/communities/[slug]/community-page-view";
import type { useCommunityPageForm } from "./use-community-page-form";

type CommunityPageForm = ReturnType<typeof useCommunityPageForm>;

/**
 * The single mapping from editor state to the public renderer, shared by the
 * docked pane and the full-screen modal. Two copies drift, and the drift only
 * shows up on the customer's page.
 */
export function buildPreviewData(
	form: CommunityPageForm,
): CommunityPageViewData {
	const {
		mainSettings,
		design,
		sections,
		businessInfo,
		bio,
		gallery,
		services,
		pricing,
	} = form;
	const org = mainSettings.organization;

	const hasCredentials =
		businessInfo.isLicensed ||
		businessInfo.isBonded ||
		businessInfo.isInsured ||
		!!businessInfo.yearEstablished ||
		businessInfo.certifications.length > 0;

	return {
		slug: mainSettings.slug,
		pageTitle: mainSettings.pageTitle,
		metaDescription: mainSettings.metaDescription || undefined,
		bioContent: bio.bioContent,
		servicesContent: services.servicesContent,
		serviceTags:
			services.draftServiceTags.length > 0
				? services.draftServiceTags
				: undefined,
		sectionConfig: sections.sectionConfig,
		pricingMode:
			pricing.pricingMode === "structured" ? "structured" : "richText",
		pricingContent: pricing.pricingContent,
		pricingTiers: pricing.pricingTiers,
		galleryImages: gallery.galleryItems
			.filter((item): item is typeof item & { url: string } => !!item.url)
			.map((item) => ({
				url: item.url,
				storageId: String(item.storageId),
				sortOrder: item.sortOrder,
			})),
		theme: design.theme,
		bannerUrl: mainSettings.bannerUrl,
		avatarUrl: mainSettings.avatarUrl,
		organization: org
			? {
					name: org.name,
					email: org.email,
					phone: org.phone,
					website: org.website,
					addressCity: org.addressCity,
					addressState: org.addressState,
					timezone: org.timezone,
				}
			: null,
		ownerInfo:
			businessInfo.ownerName || businessInfo.ownerTitle
				? {
						name: businessInfo.ownerName || undefined,
						title: businessInfo.ownerTitle || undefined,
					}
				: undefined,
		credentials: hasCredentials
			? {
					isLicensed: businessInfo.isLicensed || undefined,
					isBonded: businessInfo.isBonded || undefined,
					isInsured: businessInfo.isInsured || undefined,
					yearEstablished: businessInfo.yearEstablished,
					certifications:
						businessInfo.certifications.length > 0
							? businessInfo.certifications
							: undefined,
				}
			: undefined,
		businessHours: {
			byAppointmentOnly: businessInfo.byAppointmentOnly,
			schedule: businessInfo.byAppointmentOnly
				? undefined
				: businessInfo.businessSchedule,
		},
		socialLinks: Object.values(businessInfo.socialLinks).some(Boolean)
			? businessInfo.socialLinks
			: undefined,
	};
}

import type { CommunityPageViewData } from "@/app/communities/[slug]/community-page-view";
import {
	mapTierForSave,
	type useCommunityPageForm,
} from "./use-community-page-form";

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
		faq,
		team,
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
		tagline: mainSettings.tagline.trim() || undefined,
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
		// Through the save mapper, or blank feature rows preview and then vanish
		// on publish.
		pricingTiers: pricing.pricingTiers.map(mapTierForSave),
		galleryImages: gallery.galleryItems
			.filter((item): item is typeof item & { url: string } => !!item.url)
			.map((item) => ({
				url: item.url,
				storageId: String(item.storageId),
				sortOrder: item.sortOrder,
			})),
		// Only rows with something in them; an empty draft row would publish a
		// blank question, and the preview has to show what the page will show.
		faqItems: faq.faqItems.filter(
			(item) => item.question.trim() && item.answer.trim(),
		),
		teamMembers: team.teamMembers
			.filter((member) => member.name.trim())
			.map((member) => ({
				name: member.name,
				role: member.role || undefined,
				bio: member.bio || undefined,
				photoUrl: member.photoUrl ?? undefined,
			})),
		theme: design.layout,
		colorMode: design.colorMode,
		accent: design.accent,
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

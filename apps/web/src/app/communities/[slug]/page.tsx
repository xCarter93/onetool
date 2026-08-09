import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConvexClient } from "@/lib/convexClient";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	CommunityPageView,
	type CommunityPageViewData,
} from "./community-page-view";

// PUB-16: public near-static content — cache rendered pages for 60s
export const revalidate = 60;

interface PageProps {
	params: Promise<{ slug: string }>;
}

// Deduped so generateMetadata and the page body share one Convex read per request.
const getCommunityPage = cache(async (slug: string) => {
	const convex = getConvexClient();
	return convex.query(api.communityPages.getBySlug, { slug });
});

function buildLocalBusinessJsonLd(data: {
	pageTitle: string;
	metaDescription?: string;
	bannerUrl: string | null;
	avatarUrl: string | null;
	organization: {
		name: string;
		email?: string;
		phone?: string;
		website?: string;
	} | null;
}) {
	const ld: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		name: data.pageTitle,
	};

	if (data.metaDescription) ld.description = data.metaDescription;
	if (data.avatarUrl) ld.logo = data.avatarUrl;
	if (data.bannerUrl) ld.image = data.bannerUrl;
	if (data.organization?.email) ld.email = data.organization.email;
	if (data.organization?.phone) ld.telephone = data.organization.phone;
	if (data.organization?.website) ld.url = data.organization.website;

	return ld;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = await getCommunityPage(slug);

	if (!data) {
		return { title: "Page Not Found" };
	}

	const ogImage =
		data.bannerUrl || data.avatarUrl || "https://onetool.biz/og-default.png";

	return {
		title: data.pageTitle,
		description: data.metaDescription || undefined,
		openGraph: {
			title: data.pageTitle,
			description:
				data.metaDescription || `${data.pageTitle} - Professional services`,
			type: "website",
			url: `https://onetool.biz/communities/${slug}`,
			images: [{ url: ogImage }],
		},
		twitter: {
			card: "summary_large_image",
			title: data.pageTitle,
			description: data.metaDescription || undefined,
			images: [ogImage],
		},
	};
}

export default async function PublicCommunityPage({ params }: PageProps) {
	const { slug } = await params;
	const data = await getCommunityPage(slug);

	if (!data) {
		notFound();
		return; // unreachable, helps TypeScript narrow the type
	}

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					// Escaped so page data can never break out of the script tag.
					__html: JSON.stringify(buildLocalBusinessJsonLd(data))
						.replace(/</g, "\\u003c")
						.replace(/>/g, "\\u003e"),
				}}
			/>
			<CommunityPageView data={data satisfies CommunityPageViewData} />
		</>
	);
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BUSINESS_MONTHLY_USD } from "@/lib/plan-pricing";
import { SITE_URL } from "@/lib/site-url";
import "./marketing.css";
import "@/app/components/marketing/landing.css";
import "@/app/components/marketing/workspace/workspace.css";
import "@/app/components/marketing/workspace/record-preview.css";
import "@/app/components/marketing/halftone.css";
import "@/app/components/marketing/sections/story.css";
import "@/app/components/marketing/sections/section-motion.css";

const TITLE = "OneTool: Quote it. Get it signed. Get paid.";
const DESCRIPTION =
	"Business management for HVAC, landscaping, cleaning and trades. Clients, quotes, e-signatures, scheduling, routing, invoices and card payments. The whole job in one place, run from a phone in a truck.";
const OG_IMAGE = "/og-default.png";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: "/" },
	openGraph: {
		type: "website",
		siteName: "OneTool",
		title: TITLE,
		description: DESCRIPTION,
		url: "/",
		images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "OneTool" }],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
		images: [OG_IMAGE],
	},
};

const JSON_LD = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "SoftwareApplication",
			name: "OneTool",
			url: SITE_URL,
			description: DESCRIPTION,
			applicationCategory: "BusinessApplication",
			operatingSystem: "Web, iOS",
			offers: [
				{ "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
				{
					"@type": "Offer",
					name: "Business",
					price: String(BUSINESS_MONTHLY_USD),
					priceCurrency: "USD",
				},
			],
		},
		{
			"@type": "Organization",
			name: "OneTool",
			url: SITE_URL,
			logo: `${SITE_URL}/OneTool-mark.png`,
		},
	],
};

// No ClerkProvider here: the proxy redirects signed-in visitors away from "/", so the landing never needs Clerk JS.
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
				}}
			/>
			{children}
		</>
	);
}

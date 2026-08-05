import PageFrame from "@/app/components/landing/page-frame";
import { SmoothScroll } from "@/app/components/landing/smooth-scroll";
import { SheetIndicator } from "@/app/components/landing/sheet-indicator";
import {
	SheetSection,
	SheetStack,
} from "@/app/components/landing/sheet-stack";
import AppNavbar from "@/app/components/app-navbar";
import Hero from "@/app/components/landing/hero/hero";
import { ValueProp } from "@/app/components/landing/value-prop";
import { FeatureDetail } from "@/app/components/landing/feature-detail/feature-detail";
import { FeatureChapters } from "@/app/components/landing/feature-chapters";
import PricingSection from "@/app/components/pricing-section";
import FAQSection from "@/app/components/faq-section";
import { FinalCta } from "@/app/components/landing/final-cta";
import Footer from "@/app/components/footer";

export default function Home() {
	return (
		<SmoothScroll>
			{/* First focusable element on the page. `data-no-smooth` opts it out of
			    Lenis' anchor handler, which would preventDefault and eat the focus
			    move that makes the skip actually skip. */}
			<a
				href="#main-content"
				data-no-smooth
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:inline-flex focus:h-11 focus:items-center focus:rounded-lg focus:border focus:border-border focus:bg-card focus:px-4 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
			>
				Skip to content
			</a>
			<main
				id="main-content"
				tabIndex={-1}
				className="flex-1 overflow-x-clip outline-none"
			>
				<PageFrame />
				<SheetIndicator />
				<SheetStack>
					<AppNavbar />
					<SheetSection code="G-001" title="Cover">
						<Hero />
					</SheetSection>
					<SheetSection code="A-501" title="Features" seam>
						<ValueProp />
					</SheetSection>
					<SheetSection code="A-502" title="Capabilities">
						<FeatureDetail />
					</SheetSection>
					{/* FeatureChapters owns id="how-it-works" itself — never duplicate it here. */}
					<SheetSection code="A-101" title="How it works">
						<FeatureChapters />
					</SheetSection>
					<SheetSection code="G-002" title="Estimate">
						<PricingSection />
					</SheetSection>
					<SheetSection code="G-003" title="General notes">
						<FAQSection />
					</SheetSection>
					<SheetSection code="G-004" title="Issue">
						<FinalCta />
					</SheetSection>
					<Footer />
				</SheetStack>
			</main>
		</SmoothScroll>
	);
}

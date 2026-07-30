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
import { SceneRail } from "@/app/components/landing/scenes";
import PricingSection from "@/app/components/pricing-section";
import FAQSection from "@/app/components/faq-section";
import { FinalCta } from "@/app/components/landing/final-cta";
import Footer from "@/app/components/footer";

export default function Home() {
	return (
		<SmoothScroll>
			<main className="flex-1 overflow-x-clip">
				<PageFrame />
				<SheetIndicator />
				<SheetStack>
					<AppNavbar />
					<SheetSection code="G-001" title="Cover">
						<Hero />
					</SheetSection>
					<SheetSection code="A-501" title="Features">
						<ValueProp />
					</SheetSection>
					<SheetSection code="A-502" title="Capabilities">
						<FeatureDetail />
					</SheetSection>
					{/* SceneRail owns id="how-it-works" itself — never duplicate it here. */}
					<SheetSection code="A-101" title="How it works">
						<SceneRail />
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

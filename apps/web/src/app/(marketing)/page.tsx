import PageFrame from "@/app/components/landing/page-frame";
import { SmoothScroll } from "@/app/components/landing/smooth-scroll";
import AppNavbar from "@/app/components/app-navbar";
import Hero from "@/app/components/landing/hero/hero";
import FeatureSection from "@/app/components/feature-section";
import { SceneRail } from "@/app/components/landing/scenes";
import FAQSection from "@/app/components/faq-section";
import PricingSection from "@/app/components/pricing-section";
import Footer from "@/app/components/footer";

export default function Home() {
	return (
		<SmoothScroll>
			<main className="flex-1 overflow-x-clip">
				<PageFrame />
				<AppNavbar />
				<Hero />
				<FeatureSection />
				<SceneRail />
				<FAQSection />
				<PricingSection />
				<Footer />
			</main>
		</SmoothScroll>
	);
}

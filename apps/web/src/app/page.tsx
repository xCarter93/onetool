import PageFrame from "@/app/components/landing/page-frame";
import { SmoothScroll } from "@/app/components/landing/smooth-scroll";
import AppNavbar from "@/app/components/app-navbar";
import HeroSection from "@/app/components/hero-section";
import BlurInHeadline from "@/app/components/landing/blur-in-headline";
import FeatureSection from "@/app/components/feature-section";
import HowItWorks from "@/app/components/landing/how-it-works";
import FAQSection from "@/app/components/faq-section";
import ShowcaseSection from "@/app/components/showcase-section";
import PricingSection from "@/app/components/pricing-section";
import Footer from "@/app/components/footer";

export default function Home() {
	return (
		<SmoothScroll>
			<main className="flex-1 overflow-x-hidden">
				<PageFrame />
				<AppNavbar />
				<HeroSection />
				<BlurInHeadline />
				<FeatureSection />
				<HowItWorks />
				<FAQSection />
				<ShowcaseSection />
				<PricingSection />
				<Footer />
			</main>
		</SmoothScroll>
	);
}

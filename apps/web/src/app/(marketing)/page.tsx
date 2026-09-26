import { MarketingNav } from "@/app/components/marketing/marketing-nav";
import { ReelHost } from "@/app/components/marketing/reel-cta";
import { Compare } from "@/app/components/marketing/sections/compare";
import { Faq } from "@/app/components/marketing/sections/faq";
import { FeatureGrid } from "@/app/components/marketing/sections/feature-grid";
import { FinalCta } from "@/app/components/marketing/sections/final-cta";
import { MarketingFooter } from "@/app/components/marketing/sections/footer";
import { HomeStrip } from "@/app/components/marketing/sections/home-strip";
import { OnTheJob } from "@/app/components/marketing/sections/on-the-job";
import { Pricing } from "@/app/components/marketing/sections/pricing";
import { TryIt } from "@/app/components/marketing/sections/try-it";
import { DayStory } from "@/app/components/marketing/story/day-story";

export default function Home() {
	return (
		<div id="top" className="dc-landing min-h-screen overflow-x-clip">
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:inline-flex focus:h-11 focus:items-center focus:rounded-lg focus:border focus:border-(--rule-2) focus:bg-(--sheet) focus:px-4 focus:text-sm focus:font-medium focus:text-(--ink) focus:shadow-(--lp-shadow) focus:outline-none focus:ring-2 focus:ring-(--accent-ink)"
			>
				Skip to content
			</a>
			<MarketingNav />
			<main id="main-content" tabIndex={-1} className="outline-none">
				<DayStory />
				<HomeStrip />
				<OnTheJob />
				<FeatureGrid />
				<TryIt />
				<Compare />
				<Pricing />
				<Faq />
				<FinalCta />
			</main>
			<MarketingFooter />
			<ReelHost />
		</div>
	);
}

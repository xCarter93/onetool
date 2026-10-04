import { MarketingNav } from "@/app/components/marketing/marketing-nav";
import { Compare } from "@/app/components/marketing/sections/compare";
import { Faq } from "@/app/components/marketing/sections/faq";
import { FaqFeatures } from "@/app/components/marketing/sections/faq-features";
import { HowItWorks } from "@/app/components/marketing/sections/how-it-works";
import { Trades } from "@/app/components/marketing/sections/trades";
import { Hero } from "@/app/components/marketing/hero/hero";
import { FinalCta } from "@/app/components/marketing/sections/final-cta";
import { MarketingFooter } from "@/app/components/marketing/sections/footer";
import { OldWay } from "@/app/components/marketing/sections/old-way";
import { Pricing } from "@/app/components/marketing/sections/pricing";

export default function Home() {
	return (
		<div id="top" className="dc-landing overflow-x-clip">
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-lg focus:border focus:border-(--rule-2) focus:bg-(--sheet) focus:px-4 focus:text-sm focus:font-medium focus:text-(--ink) focus:shadow-(--lp-shadow) focus:outline-none focus:ring-2 focus:ring-(--accent-ink)"
			>
				Skip to content
			</a>
			<MarketingNav />
			<main id="main-content" tabIndex={-1} className="outline-none">
				<Hero />
				<Trades />
				<OldWay />
				<HowItWorks />
				<Pricing />
				<Compare />
				<Faq>
					<FaqFeatures />
				</Faq>
				<FinalCta />
			</main>
			<MarketingFooter />
		</div>
	);
}

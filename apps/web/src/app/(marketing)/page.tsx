import { MarketingNav } from "@/app/components/marketing/marketing-nav";
import { SheetSpine } from "@/app/components/marketing/sheet-spine";
import { TryIt } from "@/app/components/marketing/sections/try-it";
import { DuskBand } from "@/app/components/marketing/sections/dusk-band";
import { Hero } from "@/app/components/marketing/sections/hero";
import { FieldBand } from "@/app/components/marketing/sections/field-band";
import { OnePlace } from "@/app/components/marketing/sections/one-place";
import { Loop } from "@/app/components/marketing/sections/loop";
import { MoneyTime } from "@/app/components/marketing/sections/money-time";
import { WhatsInside } from "@/app/components/marketing/sections/whats-inside";
import { Numbers } from "@/app/components/marketing/sections/numbers";
import { Compare } from "@/app/components/marketing/sections/compare";
import { OnTheJob } from "@/app/components/marketing/sections/on-the-job";
import { Switching } from "@/app/components/marketing/sections/switching";
import { Pricing } from "@/app/components/marketing/sections/pricing";
import { Faq } from "@/app/components/marketing/sections/faq";
import { FinalCta } from "@/app/components/marketing/sections/final-cta";
import { MarketingFooter } from "@/app/components/marketing/sections/footer";

/**
 * The landing page — paper-and-ink drafting language, implemented from the
 * approved design comp (see .planning/landing-redesign-2026-08/DIRECTION.md).
 * Every section reads its palette from the `.dc-landing` scope in landing.css;
 * nothing here touches workspace tokens.
 */
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
			<SheetSpine />
			<main id="main-content" tabIndex={-1} className="outline-none">
				<Hero />
				<FieldBand />
				<OnePlace />
				<Loop />
				<TryIt />
				<MoneyTime />
				<WhatsInside />
				<Numbers />
				<Compare />
				<OnTheJob />
				<Switching />
				<DuskBand />
				<Pricing />
				<Faq />
				<FinalCta />
			</main>
			<MarketingFooter />
		</div>
	);
}

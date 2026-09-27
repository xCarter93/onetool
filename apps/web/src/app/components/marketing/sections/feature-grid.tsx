import type { Route } from "next";
import Link from "next/link";
import { LazyBentoCell } from "../bento/lazy-bento-cell";
import { FEATURES } from "../features";
import { Lede, Section, SectionHeading } from "../primitives";

const SHOWN_IN_BENTO = new Set(["projects", "inbox", "invoices", "automations", "assistant"]);
const MORE_FEATURES = FEATURES.filter((feature) => !SHOWN_IN_BENTO.has(feature.key));

export function FeatureGrid() {
	return (
		<Section id="inside">
			<SectionHeading size="md" className="mt-0">
				Every part of the job, in one place.
			</SectionHeading>
			<Lede className="max-w-[56ch]">
				Keep the client, the work, and the payment connected. Explore a feature to see how it works.
			</Lede>

			<div className="mt-[clamp(32px,4vw,56px)] grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				<LazyBentoCell cell="schedule" className="md:col-span-2" />
				<LazyBentoCell cell="inbox" />
				<LazyBentoCell cell="payments" />
				<LazyBentoCell cell="automation" className="md:col-span-2" />
				<LazyBentoCell cell="assistant" className="md:col-span-2" />
				<LazyBentoCell cell="command" className="md:col-span-2 lg:col-span-1" />
			</div>

			<h3 className="mt-[clamp(40px,5vw,64px)] text-[15px] font-semibold leading-6 text-(--ink)">
				More in OneTool
			</h3>
			<ul className="mt-3 grid grid-cols-1 gap-x-[clamp(24px,3vw,48px)] sm:grid-cols-2 lg:grid-cols-4">
				{MORE_FEATURES.map((feature) => (
					<li key={feature.key}>
						<Link
							href={feature.href as Route}
							className="group flex h-full items-start justify-between gap-4 border-t border-(--rule) py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink) focus-visible:ring-offset-2 focus-visible:ring-offset-(--paper)"
						>
							<span className="min-w-0">
								<span className="block text-[15px] font-semibold leading-6 text-(--ink)">
									{feature.label}
								</span>
								<span className="mt-1 block text-[13px] leading-[1.5] text-(--ink-2)">
									{feature.description}
								</span>
							</span>
							<span
								aria-hidden="true"
								className="mt-0.5 text-[15px] leading-6 text-(--ink-3) transition-[color,translate] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-(--accent-ink) motion-reduce:transition-none"
							>
								→
							</span>
						</Link>
					</li>
				))}
			</ul>
		</Section>
	);
}

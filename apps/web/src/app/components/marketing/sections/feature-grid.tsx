import type { Route } from "next";
import Link from "next/link";
import { FEATURES } from "../features";
import { Lede, Section, SectionHeading } from "../primitives";

export function FeatureGrid() {
	return (
		<Section id="inside">
			<SectionHeading size="md" className="mt-0">
				Every part of the job, in one place.
			</SectionHeading>
			<Lede className="max-w-[56ch]">
				Keep the client, the work, and the payment connected. Explore a feature to see how it works.
			</Lede>

			<ul className="mt-[clamp(32px,4vw,56px)] grid grid-cols-1 gap-x-[clamp(24px,3vw,48px)] sm:grid-cols-2 lg:grid-cols-3">
				{FEATURES.map((feature) => (
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

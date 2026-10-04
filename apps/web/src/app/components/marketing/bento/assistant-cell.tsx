import { Check, Sparkles } from "lucide-react";
import { PanelBar } from "./feature";

const THURSDAY = [
	{ job: "Gutter clearing", client: "Dunmore Residence", time: "9:00 AM" },
	{ job: "Furnace service", client: "Novak Residence", time: "11:00 AM" },
	{ job: "Window cleaning", client: "Patel Family Dental", time: "12:30 PM" },
];

export function AssistantCell() {
	return (
		<div className="flex h-full flex-col">
			<PanelBar className="justify-start gap-2">
				<Sparkles aria-hidden="true" className="size-4 text-(--accent-ink)" />
				<span className="text-sm font-semibold text-(--ink)">Assistant</span>
			</PanelBar>
			<div className="flex flex-1 flex-col gap-3 p-4">
				<p className="ml-auto w-fit rounded-lg bg-(--paper) px-3 py-2 text-sm text-(--ink)">
					What’s on for Thursday?
				</p>
				<div>
					<p className="text-sm text-(--ink)">Three visits on Thursday, October 8.</p>
					<ul className="mt-2 divide-y divide-(--rule) border-y border-(--rule)">
						{THURSDAY.map((visit) => (
							<li key={visit.job} className="flex items-baseline justify-between gap-3 py-2">
								<span className="min-w-0">
									<span className="block text-sm text-(--ink)">{visit.job}</span>
									<span className="block text-xs text-(--ink-2)">{visit.client}</span>
								</span>
								<span className="shrink-0 text-xs tabular-nums text-(--ink-2)">{visit.time}</span>
							</li>
						))}
					</ul>
				</div>
				<p className="ml-auto w-fit rounded-lg bg-(--paper) px-3 py-2 text-sm text-(--ink)">
					Add a task: Trevor hauls the brush Thursday.
				</p>
				<p className="flex items-center gap-2 text-sm text-(--ink)">
					<Check aria-hidden="true" className="size-4 shrink-0 text-(--paid)" />
					<span>
						Added to Fall property cleanup: <span className="font-medium">Haul the brush away</span>, Thu, Oct 8 ·
						Trevor Reed.
					</span>
				</p>
			</div>
		</div>
	);
}

import Image from "next/image";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { Lede, Section, SectionHeading } from "../primitives";

const TRADES = [
	{
		name: "Lawn care & landscaping",
		src: "/landing/field/landscaping.webp",
		alt: "A landscaper at an open work trailer with OneTool’s Today screen on his phone, the Kerr Road HOA weekly mow in progress",
		job: "Weekly mow",
		client: "Kerr Road HOA",
		detail: "Today · 6 visits",
		status: "in-progress",
		label: "In progress",
	},
	{
		name: "HVAC",
		src: "/landing/field/hvac-2.webp",
		alt: `An HVAC technician servicing an outdoor condenser, signed Quote Q-003107 for ${formatCurrency(189)} open in OneTool on a tablet`,
		job: "AC tune-up",
		client: "Miller Residence",
		detail: `Quote Q-003107 · ${formatCurrency(189)}`,
		status: "approved",
		label: "Signed",
	},
	{
		name: "Cleaning",
		src: "/landing/field/cleaning.webp",
		alt: "A cleaner scrubbing an oven during a move-out clean, the OneTool checklist on the counter with 2 of 4 tasks done",
		job: "Move-out clean",
		client: "18 Birch Ln",
		detail: "2 of 4 tasks done",
		status: "in-progress",
		label: "In progress",
	},
	{
		name: "Plumbing",
		src: "/landing/field/plumbing-2.webp",
		alt: `A plumber tightening the cold inlet on a new water heater, paid Invoice INV-004412 for ${formatCurrency(1450)} open in OneTool on a phone resting on top of the heater`,
		job: "Water heater install",
		client: "Brooks Residence",
		detail: `Invoice INV-004412 · ${formatCurrency(1450)}`,
		status: "paid",
		label: "Paid",
	},
];

export function Trades() {
	return (
		<Section id="trades" scheme="sheet">
			<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<SectionHeading className="mt-0">Built for the crews that keep homes running.</SectionHeading>
				<Lede className="mt-0 max-w-[30rem]">
					Run OneTool from the job, not the desk. From one truck to a crew of twenty, the same
					quote, schedule and payment on every phone.
				</Lede>
			</div>

			<ul className="lp-trades">
				{TRADES.map((trade) => (
					<li key={trade.name} className="lp-trade">
						<Image
							src={trade.src}
							alt={trade.alt}
							fill
							sizes="(min-width: 1024px) 25vw, 50vw"
							className="lp-trade-img"
						/>
						<div className="lp-trade-chip">
							<div>
								<strong>
									{trade.job}
									<span className="lp-trade-client"> · {trade.client}</span>
								</strong>
								<span className="tabular-nums">{trade.detail}</span>
							</div>
							<StatusBadge status={trade.status}>{trade.label}</StatusBadge>
						</div>
						<p className="lp-trade-name">{trade.name}</p>
					</li>
				))}
			</ul>

			<div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
				<p className="text-(--ink-2)">
					Also electrical, pest control, pool service, window cleaning, pressure washing and handymen.
				</p>
				<p className="text-xs text-(--ink-3)">Sample jobs</p>
			</div>
		</Section>
	);
}

import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { RoughMark } from "../rough-mark";

/* The loop: eight steps as a 1px-gap hairline mosaic. A single 20s cycle walks
 * the rails left-to-right across the grid — each step's fill/dot share the same
 * keyframes offset by i * 2.5s, so exactly one card is "live" at a time.
 * Delays are inline styles: a template-built class name never reaches the JIT. */

const STEPS = [
	{
		n: "01",
		title: "The client calls",
		body: "Log them once — company, contacts, every property they own. The history is there next time they ring.",
		detail: "Clients · Properties · Contacts",
	},
	{
		n: "02",
		title: "You send a quote",
		body: "Line items, your tax rate, your logo. Reusable products mean you are not pricing a filter change from scratch every week.",
		detail: "PDF generated automatically",
	},
	{
		n: "03",
		title: "They sign it",
		body: "A link, their phone, a finger. The quote flips to approved and you get told the second it happens.",
		detail: "E-signature via BoldSign",
	},
	{
		n: "04",
		title: "The work gets scheduled",
		body: "The approved quote becomes visits and tasks on the calendar, assigned to a crew, address and notes attached.",
		detail: "One-off or recurring",
	},
	{
		n: "05",
		title: "The day gets a route",
		body: "Pick the stops and get them back in driving order on a real map, with drive times. The crew follows it from the phone.",
		detail: "Optimised route · drive times",
	},
	{
		n: "06",
		title: "The invoice writes itself",
		body: "One click off the approved quote. Same totals, same line items, nothing retyped and nothing to argue about.",
		detail: "Quote → invoice, one click",
	},
	{
		n: "07",
		title: "You get paid",
		body: "They pay by card on the portal. With Stripe Connect it settles into your account, and the job closes itself out.",
		detail: "Stripe Connect · card payments",
	},
	{
		n: "08",
		title: "The follow-up runs itself",
		body: "Friday 7:00 AM, the overdue list gets walked one invoice at a time: recent ones get a reminder, the late ones become a call task.",
		detail: "Automations · you wake up to a finished run",
	},
] as const;

const CYCLE = "20s";
const STEP_DELAY = 2.5;

export function Loop() {
	return (
		<Section id="loop">
			{/* Legacy anchor: the old page shipped #how-it-works. */}
			<span
				id="how-it-works"
				aria-hidden="true"
				className="absolute -top-px left-0 block"
			/>

			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-end gap-[clamp(20px,4vw,56px)]">
				<div>
					<Eyebrow>The new way</Eyebrow>
					<SectionHeading>
						One loop. From the first call to{" "}
						<RoughMark type="highlight" color="var(--accent)">
							the money landing
						</RoughMark>
						.
					</SectionHeading>
				</div>
				<Lede>
					Nothing gets retyped between these steps. The quote becomes the visit
					becomes the invoice, off the same numbers.
				</Lede>
			</div>

			<ol className="mt-[clamp(32px,4vw,56px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] gap-px overflow-hidden rounded-2xl border border-(--rule-2) bg-(--rule-2)">
				{STEPS.map((s, i) => {
					const delay = `${i * STEP_DELAY}s`;
					return (
						<li
							key={s.n}
							className="grid min-h-[230px] content-start gap-[14px] bg-(--sheet) p-[clamp(22px,2.4vw,32px)]"
						>
							<div className="flex items-center gap-[10px]">
								<span className="font-mono text-[11.5px] font-medium tracking-[0.12em] tabular-nums text-(--accent-ink)">
									{s.n}
								</span>
								<span
									aria-hidden="true"
									className="relative h-[2px] flex-1 overflow-hidden rounded-[2px] bg-(--rule)"
								>
									<span
										className="absolute inset-0 origin-left scale-x-0 rounded-[2px] bg-(--accent)"
										style={{
											animation: `lp-loopfill ${CYCLE} linear ${delay} infinite`,
										}}
									/>
								</span>
								<span
									aria-hidden="true"
									className="h-[6px] w-[6px] flex-none rounded-full bg-(--accent) opacity-0"
									style={{
										animation: `lp-loopnum ${CYCLE} linear ${delay} infinite`,
									}}
								/>
							</div>
							<h3 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.02em]">
								{s.title}
							</h3>
							<p className="text-[15px] leading-[1.6] text-(--ink-2) text-pretty">
								{s.body}
							</p>
							<p className="mt-auto border-t border-dashed border-(--rule-2) pt-3 text-[13px] font-medium text-(--ink-3)">
								{s.detail}
							</p>
						</li>
					);
				})}
			</ol>
		</Section>
	);
}

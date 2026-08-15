import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { RoughMark } from "../rough-mark";

/* The loop: five steps as a 1px-gap hairline mosaic. A single 20s cycle walks
 * the rails left-to-right across the grid — each step's fill/dot share the same
 * keyframes offset by i * 4s — the 20% fill window tiles the cycle exactly, so
 * one card is always "live".
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
		title: "They sign it, the calendar fills",
		body: "A link, their phone, a finger — the quote flips to approved and you get told the second it happens. It becomes visits and tasks on the calendar, assigned to a crew, address and notes attached.",
		detail: "E-signature via BoldSign · one-off or recurring",
	},
	{
		n: "04",
		title: "The work gets done and invoiced",
		body: "Pick the day's stops and get them back in driving order on a real map, with drive times the crew follows from the phone. The invoice is one click off the approved quote — same totals, nothing retyped and nothing to argue about.",
		detail: "Optimised route · quote → invoice, one click",
	},
	{
		n: "05",
		title: "You get paid",
		body: "They pay by card on the portal, it settles into your account, and the job closes itself out. Friday 7:00 AM the overdue list gets walked one invoice at a time: recent ones get a reminder, the late ones become a call task.",
		detail: "Stripe Connect · automated follow-up you wake up to",
	},
] as const;

const CYCLE = "20s";
const STEP_DELAY = 4;

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

			<ol className="mt-[clamp(40px,6vw,80px)] grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-(--rule-2) bg-(--rule-2) sm:grid-cols-6">
				{STEPS.map((s, i) => {
					const delay = `${i * STEP_DELAY}s`;
					/* 6-col track: 3 + 2 on lg, 2 + 2 + 1-full on sm. Every row fills
					   the track, so no hairline cell shows through the mosaic. */
					const span =
						i < 3
							? "sm:col-span-3 lg:col-span-2"
							: i === STEPS.length - 1
								? "sm:col-span-6 lg:col-span-3"
								: "sm:col-span-3 lg:col-span-3";
					return (
						<li
							key={s.n}
							className={`grid min-h-[250px] content-start gap-[14px] bg-(--sheet) p-[clamp(22px,2.4vw,32px)] ${span}`}
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

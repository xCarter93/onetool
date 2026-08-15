"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";

/* FAQ — comp lines 590–614. Copy is verbatim. The panel animates on
 * grid-template-rows 0fr→1fr so nothing has to be measured; landing.css already
 * disables the transition under prefers-reduced-motion. */

const FAQS: ReadonlyArray<readonly [string, string]> = [
	[
		"Is this going to be too complicated for a two-person crew?",
		"No. There is no setup project and no consultant. Add a client, add a property, send a quote — that is the whole first session. The parts you do not need stay out of your way until you go looking for them.",
	],
	[
		"Can clients actually sign and pay, or do I still chase them?",
		"They get a link with your business name on it. They read the quote, sign it with a finger, and later pay the invoice by card on the same link. You see each step land as it happens.",
	],
	[
		"Where does the money go?",
		"Straight to your own bank account through Stripe Connect, on the Business plan. OneTool never sits between you and your money.",
	],
	[
		"What if I have no signal at the job?",
		"The iOS app — on the App Store now — keeps your day on the device. You can open visits, read notes and write up work with no bars, and it syncs the moment you are back in range.",
	],
	[
		"Can my crew have their own logins?",
		"Yes. Add them to your organisation, set what each person can see and do, and everyone works off the same live schedule. Users are included — you pay per organisation, not per head.",
	],
	[
		"I have hundreds of clients in a spreadsheet. Do I retype them?",
		"No. Upload the CSV and the AI import works out which column is the name, which is the address and which is the phone number, then matches anything that already exists so you do not end up with duplicates.",
	],
	[
		"What happens if I cancel?",
		"Cancel any time, no penalty. Your data stays accessible for 30 days so you can export everything, and if OneTool is not the right fit we refund the first 14 days in full.",
	],
];

export function Faq() {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();

	return (
		<Section
			id="faq"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[clamp(28px,4vw,72px)]"
		>
			<div>
				<Eyebrow>FAQ</Eyebrow>
				<SectionHeading size="md">Straight answers</SectionHeading>
				<Lede className="mt-4 max-w-[24rem] text-base">
					Anything else, email{" "}
					<a
						href="mailto:support@onetool.biz"
						className="font-medium text-(--accent-ink) underline-offset-2 transition-colors hover:text-(--ink) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
					>
						support@onetool.biz
					</a>{" "}
					— a person replies within a day.
				</Lede>
			</div>

			<ul>
				{FAQS.map(([question, answer], index) => {
					const open = openIndex === index;
					const panelId = `${baseId}-faq-panel-${index}`;

					return (
						<li key={question} className="border-t border-(--rule)">
							<button
								type="button"
								aria-expanded={open}
								aria-controls={panelId}
								onClick={() => setOpenIndex(open ? -1 : index)}
								className="group flex w-full cursor-pointer items-center gap-3.5 py-[22px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ink)"
							>
								<span
									aria-hidden="true"
									className={cn(
										"h-[7px] w-[14px] flex-none rounded-[1px] border transition-[background-color,border-color] duration-300 ease-[cubic-bezier(.23,1,.32,1)]",
										open
											? "border-(--accent) bg-(--accent)"
											: "border-(--ink-3) bg-transparent"
									)}
								/>
								<span className="flex-1 text-[clamp(16px,1.5vw,19px)] font-medium leading-[1.35] tracking-[-0.015em]">
									{question}
								</span>
								<span
									aria-hidden="true"
									className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-(--rule-2) text-[13px] text-(--ink-2) transition-[transform,border-color] duration-[250ms] ease-[cubic-bezier(.23,1,.32,1)] group-hover:scale-[1.08] group-hover:border-(--rule-3)"
								>
									{open ? "−" : "+"}
								</span>
							</button>

							<div
								id={panelId}
								className={cn(
									"grid transition-[grid-template-rows,opacity] duration-[450ms] ease-[cubic-bezier(.23,1,.32,1)]",
									open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
								)}
							>
								<div className="overflow-hidden" inert={!open}>
									<p className="max-w-[46rem] pb-6 pl-7 pr-12 text-[16px] leading-[1.65] text-(--ink-2) text-pretty">
										{answer}
									</p>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</Section>
	);
}

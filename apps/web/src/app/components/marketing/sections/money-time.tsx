import { CreditCard } from "@/components/react-bits/credit-card";
import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";
import { RoughMark } from "../rough-mark";

/* Two payoff cards. Money carries the settled card the client paid on; Time
 * carries four was/now rows under a struck heading. Both cards are flex columns
 * so the artwork and the rows bottom-align across unequal copy lengths. */

const TIME_SAVERS = [
	{
		was: "Typing the address into the quote, the calendar and the invoice",
		now: "Once",
	},
	{ was: "Remembering to chase last month's unpaid invoice", now: "Automatic" },
	{ was: "Rebuilding the quarterly service job every quarter", now: "Recurring" },
	{ was: "Finding the last email thread with a client", now: "On their record" },
] as const;

const CARD =
	"flex flex-col rounded-2xl border border-(--rule-2) bg-(--sheet) p-[clamp(24px,2.6vw,36px)]";
const CARD_HEADING =
	"mt-[14px] text-[clamp(24px,2.6vw,34px)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance";
const CARD_BODY = "mt-[14px] text-[16.5px] leading-[1.6] text-(--ink-2) text-pretty";

export function MoneyTime() {
	return (
		<Section id="money-time" divider>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-end gap-[clamp(20px,4vw,56px)]">
				<SectionHeading className="mt-0 max-w-[18ch]">
					Two things it buys back.
				</SectionHeading>
				<Lede>
					Money that arrives sooner, and the evening you currently spend catching
					up on paperwork.
				</Lede>
			</div>

			<div className="mt-[clamp(40px,6vw,80px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-stretch gap-[clamp(20px,3vw,28px)]">
				<article className={CARD}>
					<Eyebrow>Money</Eyebrow>
					<h3 className={CARD_HEADING}>
						Stop being the last person to get paid.
					</h3>
					<p className={CARD_BODY}>
						{
							"The client signs the quote on their phone and pays the invoice by card on the same link, under your business name. With Stripe Connect it lands straight in your own bank account."
						}
					</p>

					<div className="mt-auto pt-8">
						{/* What the client tapped. It only answers a click (the flip) — no
						 * hover tilt, so it stays still while you read past it. */}
						<div aria-hidden="true" className="flex justify-center">
							<CreditCard
								cardNumber="•••• •••• •••• 4180"
								cardholderName="Whitfield Residence"
								expirationDate="08/26"
								cvv="—"
								background="linear-gradient(152deg,#252c37 0%,#161b22 100%)"
								textColor="#f3f1ec"
								scale={0.78}
								borderRadius={14}
								hoverEffects={false}
								showShine={false}
								showShadow={false}
								hasTextShadow={false}
								showActionButtons={false}
								className="select-none"
							/>
						</div>
						<p className="mt-7 text-[13.5px] text-(--ink-3)">
							{
								"Without the thirty-day wait and the two reminder phone calls."
							}
						</p>
					</div>
				</article>

				<article className={CARD}>
					<Eyebrow>Time</Eyebrow>
					<h3 className={CARD_HEADING}>
						<RoughMark type="strike-through" color="var(--ink-3)">
							The evening admin shift
						</RoughMark>
						, deleted.
					</h3>
					<p className={CARD_BODY}>
						{
							"Quotes turn into scheduled visits. Approved work turns into invoices. Recurring jobs put themselves on next month's calendar. You stop retyping the same address into four places."
						}
					</p>

					<ul className="mt-auto pt-[28px]">
						{TIME_SAVERS.map((t) => (
							<li
								key={t.was}
								className="flex items-baseline justify-between gap-5 border-t border-(--rule) py-[13px]"
							>
								<span className="text-[15px] leading-[1.45] text-(--ink-2)">
									{t.was}
								</span>
								<span className="flex-none whitespace-nowrap text-[14px] font-semibold tracking-[0.01em] text-(--paid)">
									{t.now}
								</span>
							</li>
						))}
					</ul>
				</article>
			</div>
		</Section>
	);
}

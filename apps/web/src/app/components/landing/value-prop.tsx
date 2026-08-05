/**
 * The general-notes plate: three value clusters distilled from the A-501
 * capability index. Server component, zero JS.
 *
 * The section renders NO border of its own — its <SheetSection> wrapper draws
 * the kept top seam (`seam` prop) because `.bp-section` paint containment
 * would clip the registration squares here. Cards are square hairline plates,
 * never rounded cards.
 */

type Cluster = {
	readonly ref: string;
	readonly title: string;
	readonly body: string;
};

/**
 * DRAFT copy — every claim traces to shipped behaviour (quotes → BoldSign
 * e-sign → approval; portal invoices paid by card over Stripe Connect;
 * createFromQuote + the quote-approved automation). No metrics are invented.
 */
const CLUSTERS: readonly Cluster[] = [
	{
		ref: "REF 01",
		title: "Quotes clients sign",
		body: "Build a quote with line items and your own branding, send it for signature, and get an approval you can act on. No printing, no chasing paper.",
	},
	{
		ref: "REF 02",
		title: "A portal that pays you",
		body: "Clients open their own portal to review the quote and the invoice, then pay by card. With Stripe Connect the money lands in your bank account.",
	},
	{
		ref: "REF 03",
		title: "Work that runs itself",
		body: "An approved quote becomes a scheduled visit and an invoice off the same numbers. Automations handle the follow-ups so nothing waits on you remembering.",
	},
];

/** DRAFT heading. */
const HEADING = "Everything one job needs, on one sheet.";

export function ValueProp() {
	return (
		<section className="bp-section relative p-6 sm:p-10 lg:p-14">
			<h2 className="max-w-3xl text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]">
				{HEADING}
			</h2>

			<div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 lg:mt-16 lg:gap-6">
				{CLUSTERS.map((cluster, i) => (
					<article
						key={cluster.ref}
						className={`relative flex min-h-65 flex-col justify-between border border-bp-line bg-muted p-6 sm:p-8 lg:min-h-75 ${
							// The divider sits in the gutter, not on the card edge, so the
							// hairline reads as a column rule between plates.
							i > 0
								? "md:before:absolute md:before:-left-2 md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-bp-line md:before:content-[''] lg:before:-left-3"
								: ""
						}`}
					>
						<div className="flex items-start justify-between gap-4">
							<h3 className="text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
								{cluster.title}
							</h3>
							<span className="shrink-0 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] tabular-nums text-muted-foreground">
								{cluster.ref}
							</span>
						</div>
						<p className="mt-12 max-w-[34ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
							{cluster.body}
						</p>
					</article>
				))}
			</div>
		</section>
	);
}

export default ValueProp;

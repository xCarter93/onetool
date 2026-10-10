import type { CSSProperties } from "react";
import { Check, CreditCard, Send, Truck } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { Iphone } from "@/components/ui/iphone";
import { formatCurrency } from "@/lib/money";
import { ClientPhone, SCREEN_H, SCREEN_W, type PhoneScreen } from "../sections/try-it-phone";
import { DAY, INVOICE_STEP, PAID_STEP, RESET_STEP, SIGNED_STEP, through } from "./day";
import { JOB, JOB_SUBTOTAL, JOB_TAX, JOB_TOTAL } from "./job";
import { Scaled } from "./scaled";
import { SIGNATURE } from "./signature";

// Phones list the first lines and roll the rest into one row, so the subtotal still adds up.
const PHONE_LINES = 3;
const ROLLED_UP = JOB.lines.slice(PHONE_LINES);

const QUOTE_STEPS = `${through(0, INVOICE_STEP - 1)} ${RESET_STEP}`;
const INVOICE_STEPS = through(INVOICE_STEP);

const SCREENS: { on: string; screen: PhoneScreen }[] = [
	{ on: `0 ${RESET_STEP}`, screen: "quote" },
	{ on: through(SIGNED_STEP, INVOICE_STEP - 1), screen: "approved" },
	{ on: String(INVOICE_STEP), screen: "invoice" },
	{ on: through(PAID_STEP), screen: "paid" },
];

const EVENTS = [
	{ on: `0 ${RESET_STEP}`, icon: Send, text: `Sent to ${JOB.contact} · ${DAY[0].clock}` },
	{ on: String(SIGNED_STEP), icon: Check, text: `Signed on her phone · ${DAY[SIGNED_STEP].clock}`, paid: true },
	{ on: String(SIGNED_STEP + 1), icon: Truck, text: `Crew A finished the job · ${DAY[SIGNED_STEP + 1].clock}` },
	{ on: String(INVOICE_STEP), icon: Send, text: `Invoiced from the signed quote · ${DAY[INVOICE_STEP].clock}` },
	{ on: through(PAID_STEP), icon: CreditCard, text: `Paid by card · ${DAY[PAID_STEP].clock}`, paid: true },
];

const STATUSES = [
	{ on: `0 ${RESET_STEP}`, status: "sent", label: "Awaiting signature" },
	{ on: through(SIGNED_STEP, INVOICE_STEP - 1), status: "approved", label: "Signed" },
	{ on: String(INVOICE_STEP), status: "sent", label: "Sent" },
	{ on: through(PAID_STEP), status: "paid", label: "Paid" },
];

const TOTALS = { subtotal: JOB_SUBTOTAL, tax: JOB_TAX, total: JOB_TOTAL };

/** Rachel's quote as one sheet: she signs it, the crew does the job, and it becomes the invoice she pays. */
export function JobStage() {
	return (
		<div className="lp-stage" aria-hidden="true">
			<article className="lp-sheet">
				<header className="lp-sheet-head">
					<p className="lp-sheet-brand">
						<span className="lp-sheet-logo">R</span>
						Ridgeline Home Services
					</p>
					<p className="lp-sheet-doc">
						<span className="lp-swap">
							<span data-on={QUOTE_STEPS}>Quote</span>
							<span data-on={INVOICE_STEPS}>Invoice</span>
						</span>
						<strong className="lp-swap">
							<span data-on={QUOTE_STEPS}>{JOB.quote}</span>
							<span data-on={INVOICE_STEPS}>{JOB.invoice}</span>
						</strong>
					</p>
				</header>

				<p className="lp-sheet-event lp-swap">
					{EVENTS.map(({ on, icon: Icon, text, paid }) => (
						<span key={text} data-on={on} data-paid={paid || undefined}>
							<Icon size={15} strokeWidth={2.25} />
							{text}
						</span>
					))}
				</p>

				<div className="lp-sheet-meta">
					<p>
						<span className="lp-sheet-label">Bill to</span>
						<strong>{JOB.contact}</strong>
						{JOB.client}
					</p>
					<span className="lp-swap">
						{STATUSES.map(({ on, status, label }) => (
							<span key={on} data-on={on}>
								<StatusBadge status={status}>{label}</StatusBadge>
							</span>
						))}
					</span>
				</div>

				<p className="lp-sheet-job">
					<strong>{JOB.title}</strong>
					<span>Tue, Oct 6</span>
				</p>
				<ul className="lp-sheet-lines">
					{JOB.lines.map((line, i) => (
						<li key={line.id} data-rolled={i >= PHONE_LINES || undefined} style={{ "--i": i } as CSSProperties}>
							<span>{line.name}</span>
							<span>{formatCurrency(line.price)}</span>
						</li>
					))}
					<li className="lp-sheet-more" style={{ "--i": PHONE_LINES } as CSSProperties}>
						<span>{ROLLED_UP.length} more items</span>
						<span>{formatCurrency(ROLLED_UP.reduce((sum, line) => sum + line.price, 0))}</span>
					</li>
				</ul>

				<div className="lp-sheet-sum">
					<dl className="lp-sheet-totals">
						<div>
							<dt>Subtotal</dt>
							<dd>{formatCurrency(JOB_SUBTOTAL)}</dd>
						</div>
						<div>
							<dt>Tax {(JOB.taxRate * 100).toFixed(2)}%</dt>
							<dd>{formatCurrency(JOB_TAX)}</dd>
						</div>
						<div>
							<dt>Total</dt>
							<dd>{formatCurrency(JOB_TOTAL)}</dd>
						</div>
					</dl>
					<p className="lp-stamp" data-on={through(PAID_STEP)}>
						Paid
						<small>Oct 6 · Card</small>
					</p>
				</div>

				<div className="lp-sheet-sign">
					<svg className="lp-sig" data-on={through(SIGNED_STEP)} viewBox={SIGNATURE.viewBox}>
						{SIGNATURE.strokes.map((stroke) => (
							<path key={stroke.d} d={stroke.d} pathLength={1} style={{ "--at": stroke.at, "--dur": stroke.dur } as CSSProperties} />
						))}
					</svg>
					<span className="lp-swap">
						<span data-on={`0 ${RESET_STEP}`}>Client signature</span>
						<span data-on={through(SIGNED_STEP)}>
							{JOB.contact} · signed Oct 6, {DAY[SIGNED_STEP].clock}
						</span>
					</span>
				</div>
			</article>

			<div className="lp-job-phone">
				<Iphone>
					<Scaled width={SCREEN_W} height={SCREEN_H}>
						<div className="lp-job-screens">
							{SCREENS.map(({ on, screen }) => (
								<div key={screen} className="lp-job-screen" data-on={on}>
									<ClientPhone screen={screen} lines={[...JOB.lines]} totals={TOTALS} pressed={null} />
								</div>
							))}
						</div>
					</Scaled>
				</Iphone>
				<p className="lp-job-caption">{JOB.contact}&rsquo;s phone</p>
			</div>
		</div>
	);
}

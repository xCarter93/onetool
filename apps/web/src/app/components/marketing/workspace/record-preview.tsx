import { Check, CreditCard, FileText } from "lucide-react";
import type { CSSProperties } from "react";
import { StatusBadge } from "@/components/domain/status-badge";
import { formatCurrency } from "@/lib/money";
import { JOB, JOB_SUBTOTAL, JOB_TAX, JOB_TOTAL } from "../hero/job";

const LINES = JOB.lines.map((line) => ({ description: line.name, quantity: 1, unit: "job", rate: line.price }));
const SUBTOTAL = JOB_SUBTOTAL;
const TAX = JOB_TAX;
const TOTAL = JOB_TOTAL;

export function RecordPreview({ kind }: { kind: "quote" | "invoice" }) {
	const quote = kind === "quote";
	const finalStatus = quote ? "Approved" : "Paid";
	const style = {
		"--record-reveal": quote ? "var(--v5,0)" : "var(--v7,0)",
		"--record-done": quote
			? "clamp(0, calc((var(--a5,0) - 0.78) * 6), 1)"
			: "clamp(0, calc((var(--a7,0) - 0.7) * 6), 1)",
	} as CSSProperties;

	return (
		<div
			className="lp-record-preview"
			data-kind={kind}
			style={style}
			role="img"
			aria-label={`${quote ? "Quote Q-001042" : "Invoice INV-002094"} for Whitfield Property Group. ${finalStatus}. Five line items total ${formatCurrency(TOTAL)}.`}
		>
			<header className="lp-record-head">
				<div className="lp-record-heading">
					<strong>{quote ? "Quote Q-001042" : "INV-002094"}</strong>
					<span>{quote ? "Fall property cleanup" : "From Quote Q-001042"}</span>
				</div>
				<ol className="lp-record-progress" aria-hidden="true">
					{["Draft", "Sent", finalStatus].map((step, index) => (
						<li key={step} data-final={index === 2 || undefined}>
							<span className="lp-record-step-icon"><Check size={11} strokeWidth={2.5} /></span>
							{step}
						</li>
					))}
				</ol>
				<span className="lp-record-action">{quote ? "Convert to Invoice" : "Reopen"}</span>
			</header>

			<div className="lp-record-body">
				<div className="lp-record-main">
					<div className="lp-record-tabs">
						<span data-active>Overview</span>
						<span>{quote ? "Signatures" : "Payment Schedule"}</span>
						{quote && <><span>Approval Audit</span><span>Activity</span></>}
					</div>

					{!quote && (
						<div className="lp-record-highlights">
							<strong>Highlights</strong>
							<div>
								<span>Total Amount <b>{formatCurrency(TOTAL)}</b></span>
								<span>Payments <b>1 paid</b></span>
							</div>
						</div>
					)}

					<section className="lp-record-items" aria-label="Line items">
						<h2>Line Items</h2>
						<table>
							<thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
							<tbody>
								{LINES.map((line) => (
									<tr key={line.description}>
										<td>{line.description}</td>
										<td>{line.quantity}</td>
										<td>{line.unit}</td>
										<td>{formatCurrency(line.rate)}</td>
										<td>{formatCurrency(line.quantity * line.rate)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					<dl className="lp-record-totals">
						<div><dt>Subtotal</dt><dd>{formatCurrency(SUBTOTAL)}</dd></div>
						<div><dt>Tax 8.25%</dt><dd>{formatCurrency(TAX)}</dd></div>
						<div><dt>Total</dt><dd>{formatCurrency(TOTAL)}</dd></div>
					</dl>

					<div className="lp-record-outcome">
						{quote ? <Check size={16} aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
						<span>{quote ? "Signed by Rachel Whitfield" : "Visa ending 4180 · Paid Oct 6"}</span>
						{!quote && <StatusBadge status="paid">Paid</StatusBadge>}
					</div>
				</div>

				<aside className="lp-record-rail">
					<h2>Record Details</h2>
					<div className="lp-record-detail"><span>Status</span><span className="lp-record-badges"><span><StatusBadge status="sent">Sent</StatusBadge></span><span><StatusBadge status={quote ? "approved" : "paid"}>{finalStatus}</StatusBadge></span></span></div>
					<div className="lp-record-detail"><span>Client</span><strong>Whitfield Property Group</strong></div>
					<div className="lp-record-detail"><span>Project</span><strong>Fall property cleanup</strong></div>
					<div className="lp-record-pdf"><h2>Generated PDF</h2><div><FileText size={18} aria-hidden="true" /><span>{quote ? "Quote Q-001042.pdf" : "INV-002094.pdf"}</span></div></div>
				</aside>
			</div>
		</div>
	);
}

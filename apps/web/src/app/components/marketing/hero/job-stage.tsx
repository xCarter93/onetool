import { ArrowRight, Check, CreditCard, Landmark, Send } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import { Iphone } from "@/components/ui/iphone";
import { formatCurrency } from "@/lib/money";
import { ROUTE } from "@/remotion/scenes/routing-map-data";
import { ClientPhone, SCREEN_H, SCREEN_W, type PhoneScreen } from "../sections/try-it-phone";
import { PAID_STEP, through } from "./day";
import { JOB, JOB_SUBTOTAL, JOB_TAX, JOB_TOTAL } from "./job";
import { Scaled } from "./scaled";

// The slice of the 820x840 route map (its own pixels) that holds the yard and both stops; landing.css crops the art to it.
const CROP = { x: 100, y: 235, w: 600, h: 475 };
const at = (x: number, y: number) => ({
	left: `${((x - CROP.x) / CROP.w) * 100}%`,
	top: `${((y - CROP.y) / CROP.h) * 100}%`,
});
const ROUTE_D = `M ${ROUTE.map(([x, y]) => `${x} ${y}`).join(" L ")}`;

const COLLECTED_BEFORE = 11860;

type State = { on: string; status: string; label: string };

function Status({ states }: { states: State[] }) {
	return (
		<span className="lp-swap">
			{states.map((state) => (
				<span key={state.on} data-on={state.on}>
					<StatusBadge status={state.status}>{state.label}</StatusBadge>
				</span>
			))}
		</span>
	);
}

const SCREENS: { on: string; screen: PhoneScreen }[] = [
	{ on: "0 1", screen: "quote" },
	{ on: "2 3 4", screen: "approved" },
	{ on: "5", screen: "invoice" },
	{ on: through(PAID_STEP), screen: "paid" },
];

const TOTALS = { subtotal: JOB_SUBTOTAL, tax: JOB_TAX, total: JOB_TOTAL };

export function JobStage() {
	return (
		<div className="lp-job-row" aria-hidden="true">
			<article className="lp-job-card" data-on="0 1 2">
				<header className="lp-job-head">
					<span className="lp-job-kicker">Quote</span>
					<Status
						states={[
							{ on: "0 1", status: "sent", label: "Awaiting signature" },
							{ on: through(2), status: "approved", label: "Signed" },
						]}
					/>
				</header>
				<p className="lp-job-title">
					<strong>{JOB.quote}</strong>
					<span>
						{JOB.title} · {JOB.client}
					</span>
				</p>
				<ul className="lp-job-lines">
					{JOB.lines.map((line) => (
						<li key={line.id}>
							<span>{line.name}</span>
							<span>{formatCurrency(line.price)}</span>
						</li>
					))}
				</ul>
				<p className="lp-job-total">
					<span>Total with tax</span>
					<strong>{formatCurrency(JOB_TOTAL)}</strong>
				</p>
				<span className="lp-swap lp-job-swap">
					<span className="lp-job-note" data-on="0 1">
						Sent to {JOB.contact} yesterday
					</span>
					<span className="lp-job-note" data-paid data-on={through(2)}>
						<Check size={14} strokeWidth={2.5} />
						Signed by {JOB.contact} · 10:42 AM
					</span>
				</span>
			</article>

			<span className="lp-job-arrow" data-on={through(3)}>
				<ArrowRight size={18} />
			</span>

			<article className="lp-job-card" data-card="route" data-on="3 4">
				<header className="lp-job-head">
					<span className="lp-job-kicker">Route</span>
					<Status
						states={[
							{ on: "0 1 2 3", status: "active", label: "On the road" },
							{ on: through(4), status: "completed", label: "Done 1:30 PM" },
						]}
					/>
				</header>
				<p className="lp-job-title">
					<strong>Tuesday, Crew A</strong>
					<span>2 stops · 2.7 mi · 9 min of driving</span>
				</p>
				<div className="lp-job-map">
					{/* eslint-disable-next-line @next/next/no-img-element -- fixed crop of the basemap; lazy so the hidden theme's copy (and both on phones) is never fetched */}
					<img className="lp-job-map-art dark:hidden" src="/landing/hero/route-crop-light.webp" alt="" width={540} height={428} loading="lazy" decoding="async" />
					{/* eslint-disable-next-line @next/next/no-img-element -- see above */}
					<img className="lp-job-map-art hidden dark:block" src="/landing/hero/route-crop-dark.webp" alt="" width={600} height={475} loading="lazy" decoding="async" />
					<svg viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`} preserveAspectRatio="none">
						<path d={ROUTE_D} pathLength={1} className="lp-job-line" />
					</svg>
					<span className="lp-pin" data-start style={at(179.9, 689.4)}>
						S
					</span>
					<span className="lp-pin" data-live="1" style={at(180, 288.1)}>
						1
					</span>
					<span className="lp-pin" data-live="3" style={at(594.7, 456.1)}>
						2
					</span>
				</div>
				<ul className="lp-job-stops">
					<li>
						<span className="lp-pin">1</span>
						<div>
							<strong>Elm Street Plaza</strong>
							<span>Power wash · 9:00 AM</span>
						</div>
						<Status
							states={[
								{ on: "0", status: "scheduled", label: "Scheduled" },
								{ on: "1", status: "active", label: "In progress" },
								{ on: through(2), status: "completed", label: "Done" },
							]}
						/>
					</li>
					<li>
						<span className="lp-pin">2</span>
						<div>
							<strong>{JOB.client}</strong>
							<span>{JOB.title} · 11:00 AM</span>
						</div>
						<Status
							states={[
								{ on: "0 1", status: "pending", label: "Pending quote" },
								{ on: "2", status: "scheduled", label: "Scheduled" },
								{ on: "3", status: "active", label: "In progress" },
								{ on: through(4), status: "completed", label: "Done" },
							]}
						/>
					</li>
				</ul>
			</article>

			<span className="lp-job-arrow" data-on={through(5)}>
				<ArrowRight size={18} />
			</span>

			<article className="lp-job-card" data-card="invoice" data-on={through(5)}>
				<header className="lp-job-head">
					<span className="lp-job-kicker">Invoice</span>
					<Status
						states={[
							{ on: "0 1 2 3 4", status: "draft", label: "After the job" },
							{ on: "5", status: "sent", label: "Sent" },
							{ on: through(PAID_STEP), status: "paid", label: "Paid" },
						]}
					/>
				</header>
				<p className="lp-job-title">
					<strong>{JOB.invoice}</strong>
					<span>Made from the signed quote</span>
				</p>
				<p className="lp-job-amount">{formatCurrency(JOB_TOTAL)}</p>
				<ul className="lp-job-events">
					<li data-on={through(5)}>
						<Send size={15} />
						Sent to {JOB.contact} · 1:40 PM
					</li>
					<li data-on={through(PAID_STEP)}>
						<CreditCard size={15} />
						Paid by card · 1:52 PM
					</li>
					<li data-on={through(PAID_STEP)}>
						<Landmark size={15} />
						Stripe payout · Thu, Oct 8
					</li>
				</ul>
				<p className="lp-job-collected">
					<span>Collected this week</span>
					<strong data-collected>{formatCurrency(COLLECTED_BEFORE)}</strong>
				</p>
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

import { StatusBadge } from "@/components/domain/status-badge";
import { DRIVE_MIN, ROUTE, ROUTE_MILES } from "@/remotion/scenes/routing-map-data";
import { AppStoreBadge } from "../app-store-badge";
import { JOB } from "../hero/job";
import { CrewPhone } from "./crew-phone";

// The slice of the 820x840 route map (ROUTE's pixel space) both themes' images cover.
const MAP = { x: 0, y: 80, w: 820, h: 680 };
const at = (x: number, y: number) => ({
	left: `${((x - MAP.x) / MAP.w) * 100}%`,
	top: `${((y - MAP.y) / MAP.h) * 100}%`,
});
const ROUTE_D = `M ${ROUTE.map(([x, y]) => `${x} ${y}`).join(" L ")}`;

const STOPS = [
	{ pin: "S", name: "Ridgeline yard", detail: "Start · 8:40 AM", x: 179.9, y: 689.4 },
	{ pin: "1", name: "Elm Street Plaza", detail: "Power wash · 9:00 AM", x: 180, y: 288.1 },
	{ pin: "2", name: JOB.client, detail: `${JOB.title} · 11:00 AM`, x: 594.7, y: 456.1 },
];

function MapArt({ theme }: { theme: "light" | "dark" }) {
	const src = (width: number) => `/landing/run/route-${theme}-${width}.webp`;
	return (
		<picture>
			{/* Phones always get the 820. Lazy, so the hidden theme's copy is never fetched. */}
			<source
				media="(min-width: 1024px)"
				srcSet={`${src(820)} 820w, ${src(1640)} 1640w`}
				sizes="(min-width: 1340px) 820px, calc(77.2vw - 219px)"
			/>
			<img
				className={theme === "light" ? "dark:hidden" : "hidden dark:block"}
				src={src(820)}
				alt=""
				width={MAP.w}
				height={MAP.h}
				loading="lazy"
				decoding="async"
			/>
		</picture>
	);
}

export function RunMap() {
	return (
		<div className="lp-run">
			<div className="lp-run-stage">
				<div className="lp-run-map">
					<div
						className="lp-run-art"
						role="img"
						aria-label={`Crew A’s Tuesday route on a street map, from the Ridgeline yard to Elm Street Plaza, then ${JOB.client}.`}
					>
						<MapArt theme="light" />
						<MapArt theme="dark" />
						<svg viewBox={`${MAP.x} ${MAP.y} ${MAP.w} ${MAP.h}`} preserveAspectRatio="none" aria-hidden="true">
							<path d={ROUTE_D} pathLength={1} className="lp-run-line" />
						</svg>
						{STOPS.map((stop) => (
							<span key={stop.pin} className="lp-pin" data-start={stop.pin === "S" || undefined} style={at(stop.x, stop.y)} aria-hidden="true">
								{stop.pin}
							</span>
						))}
					</div>
					<small className="lp-run-credit">© OpenStreetMap contributors</small>
				</div>

				<div className="lp-job-card lp-run-card">
					<div className="lp-job-head">
						<span className="lp-job-kicker">Route</span>
						<StatusBadge status="scheduled">Scheduled</StatusBadge>
					</div>
					<p className="lp-job-title">
						<strong>Tuesday, Crew A</strong>
						<span>Optimized from client addresses</span>
					</p>
					<ol className="lp-job-stops">
						{STOPS.map((stop) => (
							<li key={stop.pin}>
								<span className="lp-pin" data-start={stop.pin === "S" || undefined} aria-hidden="true">
									{stop.pin}
								</span>
								<div>
									<strong>{stop.name}</strong>
									<span>{stop.detail}</span>
								</div>
							</li>
						))}
					</ol>
					<p className="lp-run-drive">
						{STOPS.length - 1} stops · {ROUTE_MILES} mi · {DRIVE_MIN} min of driving
					</p>
				</div>

				<CrewPhone className="lp-run-phone" />
			</div>

			<p className="lp-run-app mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-(--ink-3)">
				Crews run the day from the iOS app. It needs an internet connection.
				<AppStoreBadge className="h-10" />
			</p>
		</div>
	);
}

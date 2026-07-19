/**
 * sm variants (80x48, rendered ~56px) for dropdowns, popovers and table cells.
 *
 * These are always line art regardless of the md variant's direction: at this
 * size a UI fragment turns to mush and an isometric solid loses its faces, so
 * silhouette plus one accent is all that survives. Hand-authored, never scaled —
 * ground planes, hairlines and secondary rows are dropped rather than shrunk.
 */

export function ClientsNoneSm() {
	return (
		<>
			<rect x="12" y="10" width="46" height="30" rx="5" className="illo-surface" />
			<rect x="12" y="10" width="46" height="30" rx="5" className="illo-outline" />
			<circle cx="24" cy="21" r="4.5" className="illo-outline" />
			<line x1="33" y1="21" x2="49" y2="21" className="illo-bar" />
			<circle cx="60" cy="36" r="7" className="illo-knock" />
			<circle cx="60" cy="36" r="5.6" className="illo-accent" />
		</>
	);
}

export function ProjectsNoneSm() {
	return (
		<>
			<line x1="14" y1="41" x2="66" y2="41" className="illo-ground" />
			<rect x="14" y="26" width="14" height="15" rx="2.5" className="illo-surface" />
			<rect x="14" y="26" width="14" height="15" rx="2.5" className="illo-outline" />
			<rect x="33" y="18" width="14" height="23" rx="2.5" className="illo-surface" />
			<rect x="33" y="18" width="14" height="23" rx="2.5" className="illo-outline" />
			<rect x="52" y="10" width="14" height="31" rx="2.5" className="illo-knock" />
			<rect x="52" y="10" width="14" height="31" rx="2.5" className="illo-outline" />
			<circle cx="59" cy="5" r="3.4" className="illo-accent" />
		</>
	);
}

export function TasksNoneSm() {
	return (
		<>
			<rect x="22" y="6" width="36" height="36" rx="5" className="illo-surface" />
			<rect x="22" y="6" width="36" height="36" rx="5" className="illo-outline" />
			<rect x="28" y="14" width="6" height="6" rx="1.6" className="illo-accent" />
			<line x1="38" y1="17" x2="52" y2="17" className="illo-bar" />
			<rect x="28" y="26" width="6" height="6" rx="1.6" className="illo-outline" />
			<line x1="38" y1="29" x2="49" y2="29" className="illo-bar-quiet" />
		</>
	);
}

export function QuotesNoneSm() {
	return (
		<>
			<path d="M24 5 H50 L58 13 V43 H24 Z" className="illo-surface" />
			<path d="M24 5 H50 L58 13 V43 H24 Z" className="illo-outline" />
			<path d="M50 5 V13 H58" className="illo-outline" />
			<line x1="31" y1="22" x2="50" y2="22" className="illo-bar" />
			<line x1="31" y1="31" x2="43" y2="31" className="illo-bar-quiet" />
			<circle cx="54" cy="37" r="6" className="illo-accent" />
		</>
	);
}

export function InvoicesNoneSm() {
	return (
		<>
			<path
				d="M22 4 H52 V42 L47 39 L42 42 L37 39 L32 42 L27 39 L22 42 Z"
				className="illo-surface"
			/>
			<path
				d="M22 4 H52 V42 L47 39 L42 42 L37 39 L32 42 L27 39 L22 42 Z"
				className="illo-outline"
			/>
			<line x1="28" y1="15" x2="46" y2="15" className="illo-bar" />
			<line x1="28" y1="25" x2="40" y2="25" className="illo-bar-quiet" />
			<line x1="58" y1="23" x2="70" y2="23" className="illo-bar-accent" />
		</>
	);
}

export function AutomationsNoneSm() {
	return (
		<>
			<path d="M24 24 H34" className="illo-dash" />
			<path
				d="M46 24 H58 M46 24 C52 24 52 12 58 12 M46 24 C52 24 52 36 58 36"
				className="illo-dash"
			/>
			<rect x="10" y="17" width="14" height="14" rx="3" className="illo-surface" />
			<rect x="10" y="17" width="14" height="14" rx="3" className="illo-outline" />
			<rect x="34" y="15" width="12" height="18" rx="4" className="illo-accent-soft" />
			<rect x="34" y="15" width="12" height="18" rx="4" className="illo-accent-line" />
			<circle cx="40" cy="24" r="2.6" className="illo-accent" />
			<circle cx="62" cy="12" r="3.6" className="illo-outline" />
			<circle cx="62" cy="36" r="3.6" className="illo-outline" />
		</>
	);
}

export function NoFilterMatchSm() {
	return (
		<>
			<line x1="10" y1="14" x2="34" y2="14" className="illo-bar-quiet" />
			<line x1="10" y1="26" x2="28" y2="26" className="illo-bar-quiet" />
			<line x1="10" y1="38" x2="32" y2="38" className="illo-bar-quiet" />
			<circle cx="50" cy="22" r="13" className="illo-knock" />
			<circle cx="50" cy="22" r="13" className="illo-outline" />
			<line x1="59" y1="31" x2="69" y2="41" className="illo-accent-line" strokeWidth={4} />
		</>
	);
}

export function ActivityNoneSm() {
	return (
		<>
			<line x1="22" y1="8" x2="22" y2="40" className="illo-hair" />
			<circle cx="22" cy="14" r="4" className="illo-accent" />
			<line x1="32" y1="14" x2="60" y2="14" className="illo-bar" />
			<circle cx="22" cy="28" r="4" className="illo-knock" />
			<circle cx="22" cy="28" r="4" className="illo-outline" />
			<line x1="32" y1="28" x2="52" y2="28" className="illo-bar-quiet" />
			<circle cx="22" cy="40" r="4" className="illo-knock" />
			<circle cx="22" cy="40" r="4" className="illo-dash" />
		</>
	);
}

export function AllCaughtUpSm() {
	return (
		<>
			<circle cx="40" cy="23" r="16" className="illo-celebrate-soft" />
			<circle cx="40" cy="23" r="16" className="illo-celebrate-line" />
			<path d="M33 23 l5 5 l9 -11" className="illo-celebrate-line" strokeWidth={3} />
		</>
	);
}

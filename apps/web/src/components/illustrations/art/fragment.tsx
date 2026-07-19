/**
 * Direction C — low-fidelity UI fragments. Scoped to list and table empties,
 * where the artwork previews the records about to land there.
 *
 * Every fragment carries either a dashed target or a crisp front row so it
 * reads as *empty* rather than *loading* — that distinction is the whole
 * reason this direction is confined to tables.
 */

export function ClientsNone() {
	return (
		<>
			<rect x="44" y="18" width="112" height="20" rx="5" className="illo-surface" opacity={0.5} />
			<circle cx="56" cy="28" r="5" className="illo-mote" />
			<line x1="68" y1="28" x2="104" y2="28" className="illo-bar-quiet" />
			<rect x="44" y="42" width="112" height="20" rx="5" className="illo-surface" />
			<circle cx="56" cy="52" r="5" className="illo-mote" />
			<line x1="68" y1="52" x2="116" y2="52" className="illo-bar" />
			<rect x="44" y="66" width="112" height="20" rx="5" className="illo-knock" />
			<rect x="44" y="66" width="112" height="20" rx="5" className="illo-outline" />
			<circle cx="56" cy="76" r="5" className="illo-accent" />
			<line x1="68" y1="76" x2="112" y2="76" className="illo-bar" />
			<rect x="44" y="90" width="112" height="18" rx="5" className="illo-dash" />
		</>
	);
}

export function ProjectsNone() {
	return (
		<>
			<rect x="36" y="20" width="38" height="82" rx="6" className="illo-surface" opacity={0.55} />
			<line x1="45" y1="32" x2="65" y2="32" className="illo-bar-quiet" />
			<rect x="43" y="42" width="24" height="14" rx="3" className="illo-knock" />
			<rect x="43" y="42" width="24" height="14" rx="3" className="illo-hair" />
			<rect x="81" y="20" width="38" height="82" rx="6" className="illo-surface" />
			<line x1="90" y1="32" x2="110" y2="32" className="illo-bar" />
			<rect x="88" y="42" width="24" height="14" rx="3" className="illo-knock" />
			<rect x="88" y="42" width="24" height="14" rx="3" className="illo-outline" />
			<rect x="88" y="61" width="24" height="14" rx="3" className="illo-accent-soft" />
			<rect x="88" y="61" width="24" height="14" rx="3" className="illo-accent-line" />
			<rect x="126" y="20" width="38" height="82" rx="6" className="illo-dash" />
		</>
	);
}

/** Also serves quotes — both are amount-bearing record grids. */
export function InvoicesNone() {
	return (
		<>
			<rect x="40" y="16" width="120" height="16" rx="4" className="illo-surface" opacity={0.7} />
			<line x1="50" y1="24" x2="74" y2="24" className="illo-bar-quiet" />
			<line x1="120" y1="24" x2="150" y2="24" className="illo-bar-quiet" />
			<rect x="40" y="38" width="120" height="18" rx="4" className="illo-surface" opacity={0.45} />
			<line x1="50" y1="47" x2="90" y2="47" className="illo-bar-quiet" />
			<line x1="128" y1="47" x2="150" y2="47" className="illo-bar-quiet" />
			<rect x="40" y="60" width="120" height="18" rx="4" className="illo-knock" />
			<rect x="40" y="60" width="120" height="18" rx="4" className="illo-outline" />
			<line x1="50" y1="69" x2="94" y2="69" className="illo-bar" />
			<line x1="126" y1="69" x2="150" y2="69" className="illo-bar-accent" />
			<rect x="40" y="84" width="120" height="18" rx="4" className="illo-dash" />
		</>
	);
}

export function TasksNone() {
	return (
		<>
			<rect x="44" y="16" width="112" height="24" rx="5" className="illo-surface" />
			<rect x="52" y="24" width="10" height="8" rx="2" className="illo-accent" />
			<path
				d="M54.2 28 l1.8 1.8 l3.4 -3.9"
				className="illo-on-accent"
				strokeWidth={1.4}
			/>
			<line x1="70" y1="28" x2="120" y2="28" className="illo-bar" />
			<rect x="44" y="44" width="112" height="24" rx="5" className="illo-surface" opacity={0.5} />
			<rect x="52" y="52" width="10" height="8" rx="2" className="illo-hair" />
			<line x1="70" y1="56" x2="112" y2="56" className="illo-bar-quiet" />
			<rect x="44" y="72" width="112" height="24" rx="5" className="illo-surface" opacity={0.3} />
			<rect x="52" y="80" width="10" height="8" rx="2" className="illo-hair" />
			<line x1="70" y1="84" x2="104" y2="84" className="illo-bar-quiet" />
			<rect x="44" y="100" width="112" height="14" rx="5" className="illo-dash" />
		</>
	);
}

/** Filter chips above rows that fade out — reads as "your filter excluded these". */
export function NoFilterMatch() {
	return (
		<>
			<rect x="34" y="14" width="30" height="13" rx="6.5" className="illo-surface" />
			<rect x="34" y="14" width="30" height="13" rx="6.5" className="illo-hair" />
			<rect x="70" y="14" width="38" height="13" rx="6.5" className="illo-accent-soft" />
			<rect x="70" y="14" width="38" height="13" rx="6.5" className="illo-accent-line" />
			<rect x="114" y="14" width="26" height="13" rx="6.5" className="illo-surface" />
			<rect x="114" y="14" width="26" height="13" rx="6.5" className="illo-hair" />
			<rect x="40" y="40" width="120" height="18" rx="4" className="illo-surface" opacity={0.35} />
			<rect x="40" y="64" width="120" height="18" rx="4" className="illo-surface" opacity={0.22} />
			<rect x="40" y="88" width="120" height="18" rx="4" className="illo-surface" opacity={0.12} />
			<path d="M64 46 l16 16 m0 -16 l-16 16" className="illo-hair" opacity={0.8} />
			<path d="M64 70 l16 16 m0 -16 l-16 16" className="illo-hair" opacity={0.5} />
		</>
	);
}

/**
 * Timeline rail rather than stacked rows — an activity feed is a list, but it
 * reads chronologically, and the rail is what distinguishes it from a table.
 */
export function ActivityNone() {
	return (
		<>
			<line x1="60" y1="22" x2="60" y2="86" className="illo-hair" />
			<circle cx="60" cy="30" r="5" className="illo-accent" />
			<line x1="74" y1="27" x2="140" y2="27" className="illo-bar" />
			<line x1="74" y1="37" x2="116" y2="37" className="illo-bar-quiet" />
			<circle cx="60" cy="58" r="5" className="illo-knock" />
			<circle cx="60" cy="58" r="5" className="illo-outline" />
			<line x1="74" y1="55" x2="128" y2="55" className="illo-bar-quiet" />
			<line x1="74" y1="65" x2="104" y2="65" className="illo-bar-quiet" />
			<circle cx="60" cy="86" r="5" className="illo-knock" />
			<circle cx="60" cy="86" r="5" className="illo-dash" />
			<line x1="74" y1="86" x2="118" y2="86" className="illo-dash" />
		</>
	);
}

export function ReportChartNoData() {
	return (
		<>
			<line x1="44" y1="98" x2="160" y2="98" className="illo-outline" />
			<line x1="44" y1="98" x2="44" y2="20" className="illo-outline" />
			<rect x="58" y="72" width="16" height="26" rx="3" className="illo-surface" />
			<rect x="82" y="60" width="16" height="38" rx="3" className="illo-surface" />
			<rect x="106" y="78" width="16" height="20" rx="3" className="illo-surface" />
			<rect x="130" y="48" width="16" height="50" rx="3" className="illo-accent-soft" />
			<rect x="130" y="48" width="16" height="50" rx="3" className="illo-accent-line" />
			<path d="M52 40 H156" className="illo-dash" />
			<line x1="52" y1="26" x2="90" y2="26" className="illo-bar-quiet" />
		</>
	);
}

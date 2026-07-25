import React from "react";
import { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";
import type { IlloPaint, IlloPalette } from "./paint";

// Geometry is copied byte-for-byte from apps/web/src/components/illustrations/
// art/*.tsx — only the styling layer differs: `className` becomes a spread of
// resolved paint props. Inline web `style={{...}}` overrides beat the class
// (and the sm re-declares) on the web, so here they are explicit props placed
// AFTER the spread.

export interface ArtCtx {
	/** Resolves a web illustration className into RN-svg props. */
	p: (className: string) => IlloPaint;
	/** For the two AppError shapes that hardcode var(--destructive) on the web. */
	c: IlloPalette;
}

export type ArtFn = (ctx: ArtCtx) => React.JSX.Element;

// ---------------------------------------------------------------------------
// Fragment tier (md, 200x120) — list & table empties
// ---------------------------------------------------------------------------

export const ClientsNone: ArtFn = ({ p }) => (
	<>
		<Rect x={44} y={18} width={112} height={20} rx={5} {...p("illo-surface")} opacity={0.5} />
		<Circle cx={56} cy={28} r={5} {...p("illo-mote")} />
		<Line x1={68} y1={28} x2={104} y2={28} {...p("illo-bar-quiet")} />
		<Rect x={44} y={42} width={112} height={20} rx={5} {...p("illo-surface")} />
		<Circle cx={56} cy={52} r={5} {...p("illo-mote")} />
		<Line x1={68} y1={52} x2={116} y2={52} {...p("illo-bar")} />
		<Rect x={44} y={66} width={112} height={20} rx={5} {...p("illo-knock")} />
		<Rect x={44} y={66} width={112} height={20} rx={5} {...p("illo-outline")} />
		<Circle cx={56} cy={76} r={5} {...p("illo-accent")} />
		<Line x1={68} y1={76} x2={112} y2={76} {...p("illo-bar")} />
		<Rect x={44} y={90} width={112} height={18} rx={5} {...p("illo-dash")} />
	</>
);

export const ProjectsNone: ArtFn = ({ p }) => (
	<>
		<Rect x={36} y={20} width={38} height={82} rx={6} {...p("illo-surface")} opacity={0.55} />
		<Line x1={45} y1={32} x2={65} y2={32} {...p("illo-bar-quiet")} />
		<Rect x={43} y={42} width={24} height={14} rx={3} {...p("illo-knock")} />
		<Rect x={43} y={42} width={24} height={14} rx={3} {...p("illo-hair")} />
		<Rect x={81} y={20} width={38} height={82} rx={6} {...p("illo-surface")} />
		<Line x1={90} y1={32} x2={110} y2={32} {...p("illo-bar")} />
		<Rect x={88} y={42} width={24} height={14} rx={3} {...p("illo-knock")} />
		<Rect x={88} y={42} width={24} height={14} rx={3} {...p("illo-outline")} />
		<Rect x={88} y={61} width={24} height={14} rx={3} {...p("illo-accent-soft")} />
		<Rect x={88} y={61} width={24} height={14} rx={3} {...p("illo-accent-line")} />
		<Rect x={126} y={20} width={38} height={82} rx={6} {...p("illo-dash")} />
	</>
);

/** Also serves quotes — both are amount-bearing record grids. */
export const InvoicesNone: ArtFn = ({ p }) => (
	<>
		<Rect x={40} y={16} width={120} height={16} rx={4} {...p("illo-surface")} opacity={0.7} />
		<Line x1={50} y1={24} x2={74} y2={24} {...p("illo-bar-quiet")} />
		<Line x1={120} y1={24} x2={150} y2={24} {...p("illo-bar-quiet")} />
		<Rect x={40} y={38} width={120} height={18} rx={4} {...p("illo-surface")} opacity={0.45} />
		<Line x1={50} y1={47} x2={90} y2={47} {...p("illo-bar-quiet")} />
		<Line x1={128} y1={47} x2={150} y2={47} {...p("illo-bar-quiet")} />
		<Rect x={40} y={60} width={120} height={18} rx={4} {...p("illo-knock")} />
		<Rect x={40} y={60} width={120} height={18} rx={4} {...p("illo-outline")} />
		<Line x1={50} y1={69} x2={94} y2={69} {...p("illo-bar")} />
		<Line x1={126} y1={69} x2={150} y2={69} {...p("illo-bar-accent")} />
		<Rect x={40} y={84} width={120} height={18} rx={4} {...p("illo-dash")} />
	</>
);

/** Filter chips above rows that fade out — reads as "your filter excluded these". */
export const NoFilterMatch: ArtFn = ({ p }) => (
	<>
		<Rect x={34} y={14} width={30} height={13} rx={6.5} {...p("illo-surface")} />
		<Rect x={34} y={14} width={30} height={13} rx={6.5} {...p("illo-hair")} />
		<Rect x={70} y={14} width={38} height={13} rx={6.5} {...p("illo-accent-soft")} />
		<Rect x={70} y={14} width={38} height={13} rx={6.5} {...p("illo-accent-line")} />
		<Rect x={114} y={14} width={26} height={13} rx={6.5} {...p("illo-surface")} />
		<Rect x={114} y={14} width={26} height={13} rx={6.5} {...p("illo-hair")} />
		<Rect x={40} y={40} width={120} height={18} rx={4} {...p("illo-surface")} opacity={0.35} />
		<Rect x={40} y={64} width={120} height={18} rx={4} {...p("illo-surface")} opacity={0.22} />
		<Rect x={40} y={88} width={120} height={18} rx={4} {...p("illo-surface")} opacity={0.12} />
		<Path d="M64 46 l16 16 m0 -16 l-16 16" {...p("illo-hair")} opacity={0.8} />
		<Path d="M64 70 l16 16 m0 -16 l-16 16" {...p("illo-hair")} opacity={0.5} />
	</>
);

/** Timeline rail rather than stacked rows — the rail reads chronologically. */
export const ActivityNone: ArtFn = ({ p }) => (
	<>
		<Line x1={60} y1={22} x2={60} y2={86} {...p("illo-hair")} />
		<Circle cx={60} cy={30} r={5} {...p("illo-accent")} />
		<Line x1={74} y1={27} x2={140} y2={27} {...p("illo-bar")} />
		<Line x1={74} y1={37} x2={116} y2={37} {...p("illo-bar-quiet")} />
		<Circle cx={60} cy={58} r={5} {...p("illo-knock")} />
		<Circle cx={60} cy={58} r={5} {...p("illo-outline")} />
		<Line x1={74} y1={55} x2={128} y2={55} {...p("illo-bar-quiet")} />
		<Line x1={74} y1={65} x2={104} y2={65} {...p("illo-bar-quiet")} />
		<Circle cx={60} cy={86} r={5} {...p("illo-knock")} />
		<Circle cx={60} cy={86} r={5} {...p("illo-dash")} />
		<Line x1={74} y1={86} x2={118} y2={86} {...p("illo-dash")} />
	</>
);

// ---------------------------------------------------------------------------
// Line-art tier (md, 200x120) — concept & object states
// ---------------------------------------------------------------------------

export const SelectConversation: ArtFn = ({ p }) => (
	<>
		<Rect x={30} y={20} width={52} height={80} rx={7} {...p("illo-surface")} />
		<Rect x={30} y={20} width={52} height={80} rx={7} {...p("illo-outline")} />
		<Line x1={40} y1={34} x2={70} y2={34} {...p("illo-bar-quiet")} />
		<Rect x={36} y={44} width={40} height={14} rx={4} {...p("illo-accent-soft")} />
		<Line x1={42} y1={51} x2={66} y2={51} {...p("illo-bar-accent")} opacity={0.5} />
		<Line x1={40} y1={70} x2={70} y2={70} {...p("illo-bar-quiet")} />
		<Line x1={40} y1={84} x2={62} y2={84} {...p("illo-bar-quiet")} />
		<Rect x={94} y={20} width={76} height={80} rx={7} {...p("illo-dash")} />
		<Path d="M118 60 h28 m-9 -9 l9 9 l-9 9" {...p("illo-accent-line")} strokeWidth={2} />
	</>
);

/**
 * Restricted, not broken — neutral accent and a closed padlock, never the
 * destructive hue AppError reserves for real failures.
 */
export const AccessRestricted: ArtFn = ({ p }) => (
	<>
		<Line x1={38} y1={106} x2={162} y2={106} {...p("illo-ground")} />
		<Rect x={56} y={22} width={88} height={72} rx={8} {...p("illo-surface")} />
		<Rect x={56} y={22} width={88} height={72} rx={8} {...p("illo-outline")} />
		<Line x1={56} y1={40} x2={144} y2={40} {...p("illo-outline")} />
		<Circle cx={66} cy={31} r={2.2} {...p("illo-hair")} />
		<Circle cx={74} cy={31} r={2.2} {...p("illo-hair")} />
		<Path d="M88 62 V54 a12 12 0 0 1 24 0 V62" {...p("illo-accent-line")} strokeWidth={2} />
		<Rect x={82} y={62} width={36} height={26} rx={5} {...p("illo-accent-soft")} />
		<Rect x={82} y={62} width={36} height={26} rx={5} {...p("illo-accent-line")} />
		<Circle cx={100} cy={72} r={3} {...p("illo-accent")} />
		<Line x1={100} y1={74} x2={100} y2={80} {...p("illo-bar-accent")} />
	</>
);

export const ClientPropertiesNone: ArtFn = ({ p }) => (
	<>
		<Line x1={34} y1={102} x2={166} y2={102} {...p("illo-ground")} />
		<Path d="M62 58 L100 30 L138 58 V96 H62 Z" {...p("illo-surface")} />
		<Path d="M62 58 L100 30 L138 58 V96 H62 Z" {...p("illo-outline")} />
		<Rect x={88} y={72} width={24} height={24} rx={3} {...p("illo-knock")} />
		<Rect x={88} y={72} width={24} height={24} rx={3} {...p("illo-outline")} />
		<Rect x={72} y={66} width={12} height={10} rx={2} {...p("illo-hair")} />
		<Rect x={116} y={66} width={12} height={10} rx={2} {...p("illo-hair")} />
		<Path d="M100 30 L100 18" {...p("illo-hair")} />
		<Circle cx={100} cy={14} r={7} {...p("illo-accent")} />
		<Circle cx={100} cy={14} r={2.4} {...p("illo-knock")} />
	</>
);

/** The one place a non-accent hue is allowed outside the celebration tier. */
export const AppError: ArtFn = ({ p, c }) => (
	<>
		<Line x1={38} y1={106} x2={162} y2={106} {...p("illo-ground")} />
		<Path d="M56 26 H108 L132 50 V64 H56 Z" {...p("illo-surface")} />
		<Path d="M56 26 H108 L132 50 V64 H56 Z" {...p("illo-outline")} />
		<Path d="M60 74 H136 V96 H60 Z" {...p("illo-knock")} />
		<Path d="M60 74 H136 V96 H60 Z" {...p("illo-outline")} />
		<Line x1={72} y1={44} x2={98} y2={44} {...p("illo-bar-quiet")} />
		<Line x1={74} y1={85} x2={106} y2={85} {...p("illo-bar-quiet")} />
		<Circle cx={150} cy={34} r={12} fill={c.destructive} opacity={0.14} />
		<Path
			d="M150 28 v7 M150 40.5 v.2"
			stroke={c.destructive}
			strokeWidth={2.4}
			strokeLinecap="round"
			fill="none"
		/>
	</>
);

export const AppErrorHero: ArtFn = ({ p, c }) => (
	<>
		<Line x1={52} y1={172} x2={268} y2={172} {...p("illo-ground")} />
		<Path d="M84 40 H172 L212 80 V102 H84 Z" {...p("illo-surface")} />
		<Path d="M84 40 H172 L212 80 V102 H84 Z" {...p("illo-outline")} />
		<Path d="M172 40 V80 H212" {...p("illo-outline")} />
		<Path d="M90 118 H218 V156 H90 Z" {...p("illo-knock")} />
		<Path d="M90 118 H218 V156 H90 Z" {...p("illo-outline")} />
		<Line x1={106} y1={66} x2={152} y2={66} {...p("illo-bar-quiet")} />
		<Line x1={106} y1={84} x2={132} y2={84} {...p("illo-bar-quiet")} />
		<Line x1={110} y1={136} x2={166} y2={136} {...p("illo-bar-quiet")} />
		<Circle cx={238} cy={52} r={20} fill={c.destructive} opacity={0.14} />
		<Path
			d="M238 42 v12 M238 61 v.2"
			stroke={c.destructive}
			strokeWidth={3.4}
			strokeLinecap="round"
			fill="none"
		/>
		<Circle cx={66} cy={30} r={4} {...p("illo-mote")} />
		<Circle cx={276} cy={120} r={5.5} {...p("illo-mote")} />
		<Circle cx={252} cy={168} r={3.5} {...p("illo-mote")} />
	</>
);

// ---------------------------------------------------------------------------
// Celebration tier (md, 200x120) — isometric, wins only
// ---------------------------------------------------------------------------

export const AllCaughtUp: ArtFn = ({ p }) => (
	<>
		<Ellipse cx={100} cy={102} rx={44} ry={7} {...p("illo-mote")} opacity={0.13} />
		<Path d="M56 70 L100 46 L144 70 L100 94 Z" {...p("illo-surface")} />
		<Path d="M56 70 L100 46 L144 70 L100 94 Z" {...p("illo-outline")} />
		<Path d="M56 70 L56 80 L100 104 L100 94 Z" {...p("illo-face-left")} />
		<Path d="M56 70 L56 80 L100 104 L100 94 Z" {...p("illo-outline")} />
		<Path d="M144 70 L144 80 L100 104 L100 94 Z" {...p("illo-face-right")} />
		<Path d="M144 70 L144 80 L100 104 L100 94 Z" {...p("illo-outline")} />
		<Circle cx={100} cy={34} r={17} {...p("illo-celebrate-soft")} />
		<Circle cx={100} cy={34} r={17} {...p("illo-celebrate-line")} />
		<Path d="M92 34 l6 6 l11 -13" {...p("illo-celebrate-line")} strokeWidth={3} />
		<Circle cx={56} cy={28} r={3} {...p("illo-mote")} />
		<Circle cx={150} cy={40} r={4} {...p("illo-mote")} />
		<Circle cx={140} cy={16} r={2.5} {...p("illo-mote")} />
	</>
);

// ---------------------------------------------------------------------------
// Compact tier (sm, 80x48) — always line art at this size
// ---------------------------------------------------------------------------

export const ClientsNoneSm: ArtFn = ({ p }) => (
	<>
		<Rect x={12} y={10} width={46} height={30} rx={5} {...p("illo-surface")} />
		<Rect x={12} y={10} width={46} height={30} rx={5} {...p("illo-outline")} />
		<Circle cx={24} cy={21} r={4.5} {...p("illo-outline")} />
		<Line x1={33} y1={21} x2={49} y2={21} {...p("illo-bar")} />
		<Circle cx={60} cy={36} r={7} {...p("illo-knock")} />
		<Circle cx={60} cy={36} r={5.6} {...p("illo-accent")} />
	</>
);

export const ProjectsNoneSm: ArtFn = ({ p }) => (
	<>
		<Line x1={14} y1={41} x2={66} y2={41} {...p("illo-ground")} />
		<Rect x={14} y={26} width={14} height={15} rx={2.5} {...p("illo-surface")} />
		<Rect x={14} y={26} width={14} height={15} rx={2.5} {...p("illo-outline")} />
		<Rect x={33} y={18} width={14} height={23} rx={2.5} {...p("illo-surface")} />
		<Rect x={33} y={18} width={14} height={23} rx={2.5} {...p("illo-outline")} />
		<Rect x={52} y={10} width={14} height={31} rx={2.5} {...p("illo-knock")} />
		<Rect x={52} y={10} width={14} height={31} rx={2.5} {...p("illo-outline")} />
		<Circle cx={59} cy={5} r={3.4} {...p("illo-accent")} />
	</>
);

export const QuotesNoneSm: ArtFn = ({ p }) => (
	<>
		<Path d="M24 5 H50 L58 13 V43 H24 Z" {...p("illo-surface")} />
		<Path d="M24 5 H50 L58 13 V43 H24 Z" {...p("illo-outline")} />
		<Path d="M50 5 V13 H58" {...p("illo-outline")} />
		<Line x1={31} y1={22} x2={50} y2={22} {...p("illo-bar")} />
		<Line x1={31} y1={31} x2={43} y2={31} {...p("illo-bar-quiet")} />
		<Circle cx={54} cy={37} r={6} {...p("illo-accent")} />
	</>
);

export const InvoicesNoneSm: ArtFn = ({ p }) => (
	<>
		<Path d="M22 4 H52 V42 L47 39 L42 42 L37 39 L32 42 L27 39 L22 42 Z" {...p("illo-surface")} />
		<Path d="M22 4 H52 V42 L47 39 L42 42 L37 39 L32 42 L27 39 L22 42 Z" {...p("illo-outline")} />
		<Line x1={28} y1={15} x2={46} y2={15} {...p("illo-bar")} />
		<Line x1={28} y1={25} x2={40} y2={25} {...p("illo-bar-quiet")} />
		<Line x1={58} y1={23} x2={70} y2={23} {...p("illo-bar-accent")} />
	</>
);

export const NoFilterMatchSm: ArtFn = ({ p }) => (
	<>
		<Line x1={10} y1={14} x2={34} y2={14} {...p("illo-bar-quiet")} />
		<Line x1={10} y1={26} x2={28} y2={26} {...p("illo-bar-quiet")} />
		<Line x1={10} y1={38} x2={32} y2={38} {...p("illo-bar-quiet")} />
		<Circle cx={50} cy={22} r={13} {...p("illo-knock")} />
		<Circle cx={50} cy={22} r={13} {...p("illo-outline")} />
		<Line x1={59} y1={31} x2={69} y2={41} {...p("illo-accent-line")} strokeWidth={4} />
	</>
);

export const ActivityNoneSm: ArtFn = ({ p }) => (
	<>
		<Line x1={22} y1={8} x2={22} y2={40} {...p("illo-hair")} />
		<Circle cx={22} cy={14} r={4} {...p("illo-accent")} />
		<Line x1={32} y1={14} x2={60} y2={14} {...p("illo-bar")} />
		<Circle cx={22} cy={28} r={4} {...p("illo-knock")} />
		<Circle cx={22} cy={28} r={4} {...p("illo-outline")} />
		<Line x1={32} y1={28} x2={52} y2={28} {...p("illo-bar-quiet")} />
		<Circle cx={22} cy={40} r={4} {...p("illo-knock")} />
		<Circle cx={22} cy={40} r={4} {...p("illo-dash")} />
	</>
);

export const ClientPropertiesNoneSm: ArtFn = ({ p }) => (
	<>
		<Line x1={12} y1={42} x2={68} y2={42} {...p("illo-ground")} />
		<Path d="M26 24 L40 13 L54 24 V42 H26 Z" {...p("illo-surface")} />
		<Path d="M26 24 L40 13 L54 24 V42 H26 Z" {...p("illo-outline")} />
		<Rect x={35} y={31} width={10} height={11} rx={1.5} {...p("illo-knock")} />
		<Rect x={35} y={31} width={10} height={11} rx={1.5} {...p("illo-outline")} />
		<Circle cx={40} cy={6} r={4.5} {...p("illo-accent")} />
		<Circle cx={40} cy={6} r={1.6} {...p("illo-knock")} />
	</>
);

export const AllCaughtUpSm: ArtFn = ({ p }) => (
	<>
		<Circle cx={40} cy={23} r={16} {...p("illo-celebrate-soft")} />
		<Circle cx={40} cy={23} r={16} {...p("illo-celebrate-line")} />
		<Path d="M33 23 l5 5 l9 -11" {...p("illo-celebrate-line")} strokeWidth={3} />
	</>
);

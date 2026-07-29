import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A corner registration tick — the L-shaped mark a plotter lands on the sheet
 * margin. Pixel-mapped (no viewBox) so 1 user unit is 1 CSS px and the tick is
 * the same physical size at every breakpoint; half-pixel coordinates keep it
 * crisp at dpr 1.
 */
function RegistrationTick({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
	const rotate = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
	const pos = {
		tl: "left-0 top-0",
		tr: "right-0 top-0",
		br: "right-0 bottom-0",
		bl: "left-0 bottom-0",
	}[corner];

	return (
		<svg
			aria-hidden="true"
			focusable="false"
			width={14}
			height={14}
			className={cn("absolute stroke-bp-line-strong", pos)}
			style={{ transform: `rotate(${rotate}deg)`, strokeWidth: "var(--lw-med)" }}
			shapeRendering="crispEdges"
			fill="none"
		>
			<path d="M0.5 13.5 L0.5 0.5 L13.5 0.5" />
		</svg>
	);
}

type TitleBlockField = { label: string; value: string };

/**
 * A sheet: double outer rule, corner registration ticks, and an optional title
 * block. Server component.
 *
 * The double rule (a heavier outer line with a quieter inner line just inside
 * it) is the convention that makes a bordered box read as a drawing sheet
 * rather than a card. It is intentionally NOT the same mechanism as the
 * existing .site-frame / PageFrame fillet shell — that stays exactly as it is;
 * this is for framing individual drawings inside a section.
 *
 * Title-block values are REAL VALUES ONLY, passed as props. A sheet code, a
 * revision letter and a scale that describe nothing are costume; omit any field
 * you cannot state truthfully.
 *
 * The frame itself is decorative artwork (aria-hidden). The title block is real
 * DOM text at 4.5:1 — it carries the sheet code that the section's copy refers
 * to, so it must be readable and translatable.
 */
export function SheetFrame({
	children,
	sheet,
	title,
	scale,
	rev,
	className,
	contentClassName,
	inset = 6,
}: {
	children?: ReactNode;
	/** e.g. "A-101". Alphanumeric sheet code, en-dash reserved for the code itself. */
	sheet?: string;
	title?: string;
	scale?: string;
	/** Revision letter. */
	rev?: string;
	className?: string;
	contentClassName?: string;
	/** Gap between the outer and inner rule, in px. */
	inset?: number;
}) {
	const fields: TitleBlockField[] = [
		sheet ? { label: "Sheet", value: sheet } : null,
		title ? { label: "Title", value: title } : null,
		scale ? { label: "Scale", value: scale } : null,
		rev ? { label: "Rev", value: rev } : null,
	].filter((f): f is TitleBlockField => f !== null);

	return (
		<div className={cn("relative", className)}>
			{/* Outer rule. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 border border-bp-line-strong"
			/>
			{/* Inner rule — the quieter half of the double rule. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute border border-bp-guide-strong"
				style={{ inset: `${inset}px` }}
			/>
			<div aria-hidden="true" className="pointer-events-none absolute inset-0">
				<RegistrationTick corner="tl" />
				<RegistrationTick corner="tr" />
				<RegistrationTick corner="bl" />
				<RegistrationTick corner="br" />
			</div>

			<div className={cn("relative", contentClassName)}>{children}</div>

			{fields.length > 0 ? <TitleBlock fields={fields} inset={inset} /> : null}
		</div>
	);
}

/**
 * The bottom-corner title block. Hairline cells, tracked-caps labels,
 * tabular figures on the values — the drafting register comes from case and
 * tracking, not from a second typeface (Outfit only).
 */
function TitleBlock({
	fields,
	inset,
}: {
	fields: TitleBlockField[];
	inset: number;
}) {
	return (
		<div
			className="absolute flex divide-x divide-bp-line border border-bp-line bg-bp-paper"
			style={{ right: `${inset + 1}px`, bottom: `${inset + 1}px` }}
		>
			{fields.map((f) => (
				<div key={f.label} className="px-3 py-1.5">
					<div className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground">
						{f.label}
					</div>
					<div className="mt-1 text-[11px] font-medium leading-none tabular-nums text-foreground">
						{f.value}
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * A standalone sheet code for sections that do not want a full frame — the
 * small tracked-caps mark that names the drawing.
 */
export function SheetCode({
	code,
	label,
	className,
}: {
	/** e.g. "A-101". */
	code: string;
	/** Optional short name for the sheet. */
	label?: string;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"flex items-center gap-2 text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-bp-anno",
				className,
			)}
		>
			<span className="tabular-nums">{code}</span>
			{label ? (
				<>
					<span aria-hidden="true" className="h-px w-4 bg-bp-line-strong" />
					<span className="font-medium text-muted-foreground">{label}</span>
				</>
			) : null}
		</p>
	);
}

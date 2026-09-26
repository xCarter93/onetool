import type { CSSProperties } from "react";
import { CHAPTER_OFFSET, CHAPTERS, OLD_WAY } from "./chapters";

const EYEBROW: CSSProperties = {
	margin: "0",
	display: "flex",
	alignItems: "center",
	gap: "10px",
	fontFamily: "var(--font-mono)",
	fontSize: "11.5px",
	fontWeight: "500",
	letterSpacing: ".08em",
	textTransform: "uppercase",
};

const TITLE: CSSProperties = {
	margin: "14px 0 0",
	fontSize: "clamp(28px,2.7vw,42px)",
	lineHeight: "1.06",
	letterSpacing: "-0.035em",
	fontWeight: "600",
	textWrap: "balance",
};

const BODY: CSSProperties = {
	margin: "14px 0 0",
	fontSize: "16px",
	lineHeight: "1.6",
	color: "var(--lp-ink-2)",
	textWrap: "pretty",
};

export function CaptionBody({ scene }: { scene: number }) {
	if (scene === 1) {
		return (
			<>
				<p style={{ ...EYEBROW, color: "var(--lp-struck)" }}>
					<span
						style={{
							width: "6px",
							height: "6px",
							borderRadius: "1px",
							background: "var(--lp-struck)",
						}}
					/>
					{OLD_WAY.eyebrow}
				</p>
				<h2 style={TITLE}>{OLD_WAY.title}</h2>
				<p style={BODY}>{OLD_WAY.body}</p>
			</>
		);
	}
	const c = CHAPTERS[scene - CHAPTER_OFFSET];
	return (
		<>
			<p style={{ ...EYEBROW, color: "var(--lp-ink-3)" }}>
				<span style={{ color: "var(--lp-accent-ink)" }}>{c.n}</span>
				<span
					style={{
						width: "18px",
						height: "1px",
						background: "var(--lp-rule-3)",
					}}
				/>
				{c.eyebrow}
			</p>
			<h2 style={TITLE}>{c.title}</h2>
			<p style={BODY}>{c.body}</p>
			<div
				style={{
					marginTop: "24px",
					display: "flex",
					alignItems: "baseline",
					gap: "12px",
					paddingTop: "14px",
					borderTop: "1px solid var(--lp-rule)",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
						letterSpacing: ".1em",
						textTransform: "uppercase",
						color: "var(--lp-ink-3)",
						flex: "none",
					}}
				>
					Before
				</span>
				<span
					style={{
						position: "relative",
						fontSize: "14.5px",
						color: "var(--lp-ink-2)",
					}}
				>
					{c.before}
					<span
						style={{
							position: "absolute",
							left: "0",
							top: "55%",
							height: "1.5px",
							background: "var(--lp-struck)",
							width: `calc(var(--a${scene},0) * 100%)`,
						}}
					/>
				</span>
			</div>
		</>
	);
}

export function PinnedCaptions({ scene: active }: { scene: number }) {
	return <div className="lp-story-caption-slides">{Array.from({ length: CHAPTERS.length + 1 }, (_, k) => {
		const scene = k + 1;
		return (
			<div key={scene} aria-hidden={scene !== active} className="lp-story-caption-slide" data-active={scene === active || undefined}>
				<CaptionBody scene={scene} />
			</div>
		);
	})}</div>;
}

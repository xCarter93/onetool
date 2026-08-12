import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { fontFamily, type, useTokens } from "@/lib/theme";

// One captured pen stroke as an SVG path `d` string ("M… L… L…").
export interface SignatureStroke {
	d: string;
}

/**
 * Serialize captured strokes to a standalone SVG document — this exact string
 * is what gets uploaded as the signature blob (image/svg+xml). Vector output:
 * lossless at any size, tiny payload, and renders in the web audit card's
 * <img> as-is. Ink is fixed near-black (not themed) — a signature is a
 * document artifact, not UI.
 */
export function buildSignatureSvg(
	strokes: SignatureStroke[],
	width: number,
	height: number
): string {
	const paths = strokes
		.map(
			(s) =>
				`<path d="${s.d}" fill="none" stroke="#17181a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
		)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" width="${Math.round(width)}" height="${Math.round(height)}">${paths}</svg>`;
}

const fmt = (n: number) => Math.round(n * 10) / 10;

/**
 * The drawing surface: a Pan gesture appends to the in-progress path, ended
 * strokes commit to the controlled `strokes` array. Callbacks are forced onto
 * the JS thread (`runOnJS(true)`) — with Reanimated installed they'd default
 * to UI-thread worklets and setState would crash.
 */
export function SignaturePad({
	width,
	height,
	strokes,
	onStrokesChange,
}: {
	width: number;
	height: number;
	strokes: SignatureStroke[];
	onStrokesChange: (next: SignatureStroke[]) => void;
}) {
	const t = useTokens();
	const [livePath, setLivePath] = useState<string | null>(null);

	const pan = Gesture.Pan()
		.runOnJS(true)
		.minDistance(0)
		.maxPointers(1)
		.onBegin((e) => {
			setLivePath(`M${fmt(e.x)},${fmt(e.y)}`);
		})
		.onUpdate((e) => {
			setLivePath((prev) =>
				prev ? `${prev} L${fmt(e.x)},${fmt(e.y)}` : `M${fmt(e.x)},${fmt(e.y)}`
			);
		})
		.onFinalize(() => {
			setLivePath((prev) => {
				// A bare tap ("M…" with no line segment) still leaves a dot-sized
				// mark on paper — keep it as a zero-length line so it renders.
				if (prev) {
					onStrokesChange([
						...strokes,
						{ d: prev.includes(" L") ? prev : `${prev} l0.1,0.1` },
					]);
				}
				return null;
			});
		});

	const empty = strokes.length === 0 && !livePath;

	return (
		<GestureDetector gesture={pan}>
			<View
				style={[
					styles.pad,
					{ width, height, backgroundColor: t.card, borderColor: t.line },
				]}
				accessibilityLabel="Signature area"
				accessibilityHint="Draw the signature with a finger"
			>
				{/* Baseline: the sign-here rule with the customary ✕. */}
				<View style={[styles.baseline, { borderColor: t.faintDecor }]} />
				<Text style={[styles.baselineMark, { color: t.faintDecor }]}>✕</Text>
				{empty ? (
					<Text style={[styles.hint, { color: t.faint }]}>Sign here</Text>
				) : null}
				<Svg width={width} height={height} style={StyleSheet.absoluteFill}>
					{strokes.map((s, i) => (
						<Path
							key={i}
							d={s.d}
							fill="none"
							stroke={t.ink}
							strokeWidth={2.5}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					))}
					{livePath ? (
						<Path
							d={livePath}
							fill="none"
							stroke={t.ink}
							strokeWidth={2.5}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					) : null}
				</Svg>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	pad: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	baseline: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 40,
		borderBottomWidth: 1,
		borderStyle: "dashed",
	},
	baselineMark: {
		position: "absolute",
		left: 26,
		bottom: 46,
		fontFamily: fontFamily.medium,
		fontSize: 14,
	},
	hint: {
		position: "absolute",
		alignSelf: "center",
		top: "42%",
		fontFamily: fontFamily.medium,
		fontSize: type.rowTitle,
	},
});

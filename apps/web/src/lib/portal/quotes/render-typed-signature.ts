/**
 * Render a typed name to a PNG dataURL using the Caveat font.
 *
 * Why this exists:
 * - Plan 14-03 Pattern 4 + Pitfall 7: canvas `fillText` does not trigger font
 *   load. If we draw before Caveat is ready, the bytes captured to PNG store
 *   the fallback (Times) — which is exactly what the client did NOT see.
 *   That is a real evidentiary problem, not just cosmetic.
 * - We therefore await BOTH `document.fonts.load(...)` AND `document.fonts.ready`
 *   before any `fillText` call.
 * - High-DPI canvas pattern: backing-store size = cssWidth * devicePixelRatio
 *   while CSS layout size stays at cssWidth. Without this the PNG is blurry
 *   on the org's screen even though it looked crisp to the client.
 */

export interface TypedSignatureOptions {
	/** CSS width in pixels (default 600). */
	width?: number;
	/** CSS height in pixels (default 160). */
	height?: number;
	/** Font size in pixels (default 64). */
	fontSize?: number;
	/** Fill color (default near-black, matches portal foreground). */
	color?: string;
}

export interface TypedSignatureResult {
	dataUrl: string;
	raw: { typedName: string; font: "Caveat" };
}

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 160;
const DEFAULT_FONT_SIZE = 64;
const DEFAULT_COLOR = "#0f172a";

export async function renderTypedSignatureToPng(
	name: string,
	opts: TypedSignatureOptions = {},
): Promise<TypedSignatureResult> {
	if (name.trim().length < 2) {
		throw new Error(
			"Typed signature name must be at least 2 non-whitespace characters.",
		);
	}

	const width = opts.width ?? DEFAULT_WIDTH;
	const height = opts.height ?? DEFAULT_HEIGHT;
	const fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
	const color = opts.color ?? DEFAULT_COLOR;

	// Pitfall 7: ensure Caveat is loaded BEFORE drawing. The fontsource @font-face
	// declarations only kick a load when something references them; a canvas
	// `fillText` does not. We must explicitly request the load and then await
	// `document.fonts.ready` to be sure.
	await document.fonts.load(`${fontSize}px "Caveat"`);
	await document.fonts.ready;

	const canvas = document.createElement("canvas");
	const dpr = Math.max(window.devicePixelRatio ?? 1, 1);
	canvas.width = width * dpr;
	canvas.height = height * dpr;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to acquire 2D canvas context.");
	}

	ctx.scale(dpr, dpr);
	ctx.fillStyle = color;
	ctx.font = `${fontSize}px "Caveat", cursive`;
	ctx.textBaseline = "middle";
	ctx.fillText(name, 16, height / 2);

	return {
		dataUrl: canvas.toDataURL("image/png"),
		raw: { typedName: name, font: "Caveat" },
	};
}

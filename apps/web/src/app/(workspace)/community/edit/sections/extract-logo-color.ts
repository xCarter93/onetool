/**
 * The brand colour an owner already has, read off the logo they already
 * uploaded — so the common case is one click rather than a colour picker.
 *
 * Convex file URLs answer with `Access-Control-Allow-Origin` echoing the
 * requesting origin, so a `crossOrigin="anonymous"` load leaves the canvas
 * readable. If that ever stops being true the read throws a SecurityError,
 * which is why every caller has a visible fallback path.
 */

/** Small enough to be one quick pass, large enough to survive a detailed mark. */
const SAMPLE_SIZE = 64;

/** Hue buckets. 15° is coarse enough that a gradient still lands in one bucket. */
const BUCKETS = 24;

function toHex(r: number, g: number, b: number): string {
	const part = (c: number) =>
		Math.round(Math.min(255, Math.max(0, c)))
			.toString(16)
			.padStart(2, "0");
	return `#${part(r)}${part(g)}${part(b)}`;
}

/** A stalled fetch fires neither handler, so the promise needs its own end. */
const LOAD_TIMEOUT_MS = 8000;

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const timer = setTimeout(
			() => reject(new Error("Could not load the logo")),
			LOAD_TIMEOUT_MS,
		);
		image.crossOrigin = "anonymous";
		image.onload = () => {
			clearTimeout(timer);
			resolve(image);
		};
		image.onerror = () => {
			clearTimeout(timer);
			reject(new Error("Could not load the logo"));
		};
		image.src = url;
	});
}

/**
 * The most present colour in a logo, ignoring the parts that carry no brand:
 * transparency, the white or black a mark sits on, and greys.
 *
 * Weighting by saturation rather than pixel count is deliberate — a logo is
 * usually mostly background, and the one accent stroke is the colour the owner
 * would name if you asked them.
 */
export async function extractLogoColor(url: string): Promise<string> {
	const image = await loadImage(url);
	const canvas = document.createElement("canvas");
	canvas.width = SAMPLE_SIZE;
	canvas.height = SAMPLE_SIZE;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("Could not read the logo");
	context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

	const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
	const buckets = Array.from({ length: BUCKETS }, () => ({
		weight: 0,
		r: 0,
		g: 0,
		b: 0,
	}));

	for (let i = 0; i < data.length; i += 4) {
		const [r, g, b, alpha] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
		if (alpha < 128) continue;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const lightness = (max + min) / 2 / 255;
		// Off-white and near-black are the paper a logo is printed on.
		if (lightness > 0.92 || lightness < 0.08) continue;
		const chroma = max - min;
		const saturation = chroma / (255 - Math.abs(max + min - 255) || 1);
		if (saturation < 0.15) continue;

		let hue = 0;
		if (max === r) hue = ((g - b) / chroma) % 6;
		else if (max === g) hue = (b - r) / chroma + 2;
		else hue = (r - g) / chroma + 4;
		hue = ((hue * 60 + 360) % 360) / 360;

		const bucket = buckets[Math.min(BUCKETS - 1, Math.floor(hue * BUCKETS))];
		bucket.weight += saturation;
		bucket.r += r * saturation;
		bucket.g += g * saturation;
		bucket.b += b * saturation;
	}

	const winner = buckets.reduce((best, bucket) =>
		bucket.weight > best.weight ? bucket : best,
	);
	if (winner.weight === 0) {
		throw new Error("That logo has no colour to pull from");
	}
	return toHex(
		winner.r / winner.weight,
		winner.g / winner.weight,
		winner.b / winner.weight,
	);
}

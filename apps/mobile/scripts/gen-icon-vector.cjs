/*
 * Crisp production icon generator (BRAND-03, vector path).
 * The only OneTool mark in the repo is a 296px raster (assets/OneTool-mark.png);
 * a plain sips upscale to 1024 smears its flat edges. This pipeline instead
 * VECTORIZES the mark — color-separate (blue wrench / green check) -> potrace
 * each to a clean path -> recolor with the mark's sampled brand colors ->
 * render the SVG at high density onto a padded 1024x1024 OPAQUE white field.
 *
 * Deps are NOT in the app's package.json (one-off art tooling). Run via a
 * scratch install:
 *   mkdir -p /tmp/icongen && cd /tmp/icongen && pnpm init -y && pnpm add sharp potrace
 *   node <repo>/apps/mobile/scripts/gen-icon-vector.cjs
 * (run with cwd = the scratch dir so require() resolves sharp/potrace there).
 */
const path = require("path");
const sharp = require("sharp");
const { Potrace } = require("potrace");

const MOBILE = path.resolve(__dirname, "..");
const SRC = path.join(MOBILE, "assets/OneTool-mark.png");
const OUT = path.join(MOBILE, "assets/icon.png");
const CANVAS = 1024; // final square
const GLYPH = 800; // mark's longest edge inside the canvas (~11% margin each side)
const BG = "#ffffff";

const hex = (n) => n.toString(16).padStart(2, "0");

function traceMask(grayBuf, w, h, fill) {
	return new Promise((resolve, reject) => {
		// potrace reads a PNG buffer; shape = black (0), bg = white (255).
		sharp(grayBuf, { raw: { width: w, height: h, channels: 1 } })
			.png()
			.toBuffer()
			.then((png) => {
				const tracer = new Potrace({
					threshold: 128,
					turdSize: 2, // drop specks <=2px (kills AA noise)
					alphaMax: 1,
					optCurve: true,
					optTolerance: 0.2,
				});
				tracer.loadImage(png, (err) => {
					if (err) return reject(err);
					resolve(tracer.getPathTag(fill));
				});
			})
			.catch(reject);
	});
}

(async () => {
	const { data, info } = await sharp(SRC)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width: w, height: h, channels: ch } = info;

	const blue = Buffer.alloc(w * h, 255);
	const green = Buffer.alloc(w * h, 255);
	let bs = [0, 0, 0],
		bn = 0,
		gs = [0, 0, 0],
		gn = 0;

	for (let i = 0; i < w * h; i++) {
		const r = data[i * ch],
			g = data[i * ch + 1],
			b = data[i * ch + 2],
			a = data[i * ch + 3];
		if (a < 100) continue; // transparent background
		const max = Math.max(r, g, b);
		if (b === max && b - r > 15) {
			blue[i] = 0; // wrench (blue dominant)
			bs[0] += r; bs[1] += g; bs[2] += b; bn++;
		} else if (g === max && g - r > 15) {
			green[i] = 0; // check (green dominant)
			gs[0] += r; gs[1] += g; gs[2] += b; gn++;
		}
		// else near-white interior/edge -> background
	}

	const blueHex = `#${hex(Math.round(bs[0] / bn))}${hex(Math.round(bs[1] / bn))}${hex(Math.round(bs[2] / bn))}`;
	const greenHex = `#${hex(Math.round(gs[0] / gn))}${hex(Math.round(gs[1] / gn))}${hex(Math.round(gs[2] / gn))}`;
	console.log(`sampled blue=${blueHex} (${bn}px)  green=${greenHex} (${gn}px)`);

	const [bluePath, greenPath] = await Promise.all([
		traceMask(blue, w, h, blueHex),
		traceMask(green, w, h, greenHex),
	]);

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bluePath}${greenPath}</svg>`;

	// Render the vector large (high density) then fit to GLYPH; center on an
	// opaque white CANVAS and strip alpha (App Store icons reject transparency).
	const glyph = await sharp(Buffer.from(svg), { density: 600 })
		.resize(GLYPH, GLYPH, {
			fit: "contain",
			background: { r: 255, g: 255, b: 255, alpha: 0 },
		})
		.png()
		.toBuffer();

	await sharp({
		create: { width: CANVAS, height: CANVAS, channels: 4, background: BG },
	})
		.composite([{ input: glyph, gravity: "center" }])
		.flatten({ background: BG })
		.removeAlpha()
		.png()
		.toFile(OUT);

	const meta = await sharp(OUT).metadata();
	console.log(
		`wrote ${OUT}: ${meta.width}x${meta.height} hasAlpha=${meta.hasAlpha}`,
	);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});

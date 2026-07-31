/**
 * The OneTool mark (wrench + check), placeable inside illustration scenes.
 *
 * Geometry is the real brand SVG (296x296), but paint comes from the illo
 * tokens — wrench → accent, check → celebrate — so the mark stays on-theme in
 * both modes. `size` is the rendered box in the parent's viewBox units.
 */

const WRENCH_D =
	"M162.33 29.19C166.56 29.19 170.78 29.2 175 29.21C179.3 29.18 186.47 30.51 189.68 33.5C189.58 37.64 180.5 45.19 177.37 48.05C170.93 53.92 164.68 60.56 158.79 66.99C157.39 68.52 152.8 72.94 152.21 74.56C150.78 78.48 154.59 87.73 155.97 91.44C157.62 95.86 157.74 101.76 161.03 105.64C164.14 109.28 169.75 107.7 173.77 109.01C176.16 109.78 185.97 112.58 188.12 111.69C193.24 109.58 197.27 103.19 201.13 99.3C209.74 90.61 217.57 80.81 227.05 72.91C228.13 72.02 229.39 71.87 230.5 71.06C238.77 75.6 238.29 94.65 238.12 103.17C237.72 122.95 224.28 146.06 206.69 155.85C201.45 158.76 195.33 161.36 189.51 162.99C188.34 163.31 187.06 162.91 185.9 163.23C183.43 163.89 180.54 164.69 178 164.81C172.56 164.8 167.11 164.8 161.67 164.79C158.18 164.41 153.93 163.96 150.51 162.97C148.99 162.52 147.54 161.44 146 161.17C138.99 165.03 133.37 172.32 127.75 177.91C123.5 182.15 118.7 185.99 114.41 190.23C108.3 196.28 102.35 203.11 95.46 208.3C91.49 211.29 88.44 215.57 84.65 218.8C71.95 229.63 53.83 227.87 43.19 214.81C35.94 205.91 36.19 191.71 42.16 182.17C46.83 174.71 53.42 168.87 59.73 162.57C69.24 153.06 78.6 143.4 88.21 134.07C91.09 131.27 102.6 121.43 103.76 118.67C104.67 116.51 102.67 112.77 102 110.77C100.86 107.36 100.35 102.56 100.21 99C100.21 95.56 100.21 92.11 100.21 88.67C102.9 63.94 118.54 42.16 142.4 33.83C148.26 31.78 155.94 28.82 162.33 29.19Z";

const CHECK_D =
	"M120.93 215.5C124.7 208.42 134.41 201.07 140.59 195.78C142.84 193.85 145.83 190.52 149.18 192.18C153.18 194.18 164.97 206.28 168.81 210.04C172.75 213.89 175.36 217.55 180.64 213.64C183.47 211.53 185.55 208.4 188.3 206.16C200.41 196.32 212.07 185.41 223.54 174.73C226.94 171.57 229.98 168.06 233.6 165.09C240.58 159.38 246.01 149.98 254.72 158.83C255.81 159.95 257.19 161.02 257.85 162.47C260.16 167.52 253.14 173.9 250.24 177.34C243.43 185.43 236.82 193.73 229.94 201.76C227.12 205.05 223.86 207.99 221.32 211.5C218.18 215.84 214.45 219.44 211.1 223.55C206.76 228.87 202.63 234.71 197.93 239.76C194.68 243.24 191.14 246.71 188.38 250.6C185.75 254.32 177.73 264.98 173.5 265.95C168.58 267.08 162.8 259.12 159.62 256.2C150.77 248.07 142.11 239.14 133.96 230.37C129.62 225.69 123.22 221.59 120.93 215.5Z";

export type OneToolMarkVariant =
	/** Brand duotone: wrench = accent, check = celebrate. The default. */
	| "duotone"
	/** Single-hue monoline for quiet placements (etched into a surface). */
	| "outline"
	/** Knockout fill for sitting on a solid accent/celebrate shape. */
	| "knockout";

export interface OneToolMarkProps {
	/** Top-left of the mark's box, in the parent viewBox's units. */
	x: number;
	y: number;
	/** Rendered box size (the mark is square). */
	size: number;
	variant?: OneToolMarkVariant;
	/**
	 * Extra transform (e.g. an iso matrix), applied in the parent's coordinate
	 * space *before* the mark's own translate/scale — so rotation and scale
	 * pivot on the parent viewBox origin, not the mark's centre.
	 */
	transform?: string;
	opacity?: number;
}

export function OneToolMark({
	x,
	y,
	size,
	variant = "duotone",
	transform,
	opacity,
}: OneToolMarkProps) {
	const s = size / 296;
	// Outline stroke lives in 296-unit local space — compensate the scale so it
	// lands at ~1.3 viewBox units like the rest of the linework.
	const strokeWidth = 1.3 / s;
	const place = `translate(${x} ${y}) scale(${s})`;
	return (
		<g
			transform={transform ? `${transform} ${place}` : place}
			opacity={opacity}
		>
			{variant === "duotone" && (
				<>
					<path d={WRENCH_D} className="illo-accent" />
					<path d={CHECK_D} className="illo-celebrate" />
				</>
			)}
			{variant === "outline" && (
				<>
					<path d={WRENCH_D} className="illo-outline" style={{ strokeWidth }} />
					<path d={CHECK_D} className="illo-outline" style={{ strokeWidth }} />
				</>
			)}
			{variant === "knockout" && (
				<>
					<path d={WRENCH_D} className="illo-fill-knock" />
					<path d={CHECK_D} className="illo-fill-knock" />
				</>
			)}
		</g>
	);
}

import { cn } from "@/lib/utils";

type Scene = "map" | "old-way" | "house" | "van" | "paid" | "ahead" | "street" | "vans" | "doorstep";
type Art = { width: number; height: number; alt?: { below: number; width: number } };

// `alt` is its own composition at the same on-screen mark size, swapped in below a breakpoint; not a srcset downscale.
const BAND: Art = { width: 3072, height: 960, alt: { below: 769, width: 1536 } };
const ART: Record<Exclude<Scene, "map">, Art> = {
	"old-way": { width: 2400, height: 1200, alt: { below: 1280, width: 2560 } },
	house: BAND,
	van: BAND,
	paid: BAND,
	ahead: BAND,
	street: { width: 3072, height: 1317 },
	vans: { width: 2048, height: 878 },
	doorstep: { width: 1536, height: 1032 },
};

export function Halftone({ scene, reveal, eager, className }: { scene: Scene; reveal?: boolean; eager?: boolean; className?: string }) {
	if (scene === "map") {
		// Drawn by halftone.css as generated content, which never becomes the LCP element.
		return <div aria-hidden="true" data-scene="map" className={cn("lp-halftone", className)} />;
	}

	const { width, height, alt } = ART[scene];
	const src = `/landing/halftone/${scene}`;
	return (
		<div
			aria-hidden="true"
			data-scene={scene}
			data-reveal={reveal ? "" : undefined}
			className={cn("lp-halftone", className)}
		>
			<picture>
				{alt && <source media={`(max-width: ${alt.below - 1}px)`} srcSet={`${src}-${alt.width}.webp`} />}
				<img src={`${src}.webp`} width={width} height={height} alt="" decoding="async" loading={eager ? "eager" : "lazy"} />
			</picture>
		</div>
	);
}

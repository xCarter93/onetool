import Image from "next/image";
import type { Ref } from "react";
import homeAtDusk from "../../../../../public/landing/story-homecoming.png";

const SCENES = ["/landing/story-dawn.jpg", "/landing/story-midday.jpg", homeAtDusk];

export function StoryBackdrop({ ref }: { ref?: Ref<HTMLDivElement> }) {
	return (
		<div className="lp-story-atmosphere" aria-hidden="true">
			<div ref={ref} className="lp-story-photos">
				{SCENES.map((src, index) => (
					<div key={index} className="absolute inset-0" style={{ opacity: index === 0 ? 1 : 0 }}>
						<Image src={src} alt="" fill sizes="100vw" priority={index === 0} className="object-cover" style={{ objectPosition: index === 2 ? "72% center" : "center 60%" }} />
					</div>
				))}
			</div>
			<div className="lp-story-halftone" />
			<div className="lp-story-grid" />
		</div>
	);
}

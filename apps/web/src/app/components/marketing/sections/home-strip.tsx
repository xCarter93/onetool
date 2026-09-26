import Image from "next/image";
import homeAtDusk from "../../../../../public/landing/story-homecoming.png";
import { Container } from "../primitives";

export function HomeStrip() {
	return (
		<section className="relative border-t border-(--rule)">
			<Container className="py-[clamp(40px,5vw,72px)]">
				<figure className="overflow-hidden rounded-[16px] border border-(--rule-2) bg-(--sheet)">
					<div className="relative h-[clamp(300px,34vw,460px)]">
						<Image
							src={homeAtDusk}
							alt="A tradesperson arriving home to their child and partner at sunset"
							fill
							sizes="(min-width: 1320px) 1240px, 100vw"
							className="object-cover"
							style={{ objectPosition: "72% center" }}
						/>
					</div>
					<figcaption className="p-[clamp(20px,4vw,40px)]">
						<p className="max-w-[22ch] text-[clamp(26px,3.2vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-(--ink)">
							Home for dinner. The paperwork&apos;s done.
						</p>
					</figcaption>
				</figure>
			</Container>
		</section>
	);
}

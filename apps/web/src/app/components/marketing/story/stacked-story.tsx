import type { CSSProperties } from "react";
import { CaptionBody } from "./captions";
import { SCENE_COUNT } from "./chapters";
import { FRAME_H, FRAME_W } from "./frame/frame-size";
import { OldWayCards } from "./frame/old-way-cards";
import { SCENE_CONTENTS } from "./frame/scene-contents";
import { WorkspaceFrame } from "./frame/workspace-frame";
import { HeroCopy } from "./hero-copy";
import { ScaledFrame } from "./scaled-frame";

// Every scroll-driven var at its end value, so each scene renders settled.
const SETTLED = Object.fromEntries([
	["--h", "1"],
	["--g", "236"],
	["--f", "292"],
	...Array.from({ length: SCENE_COUNT }, (_, i) => [
		[`--v${i}`, "1"],
		[`--a${i}`, "1"],
	]).flat(),
]) as CSSProperties;

export function StackedStory() {
	return (
		<>
			<div className="mx-auto max-w-[1320px] px-[clamp(20px,4vw,40px)] pt-12">
				<HeroCopy />
			</div>
			<ol
				id="story-overview"
				className="mx-auto max-w-[760px] space-y-[clamp(56px,9vw,96px)] px-[clamp(20px,4vw,40px)] pb-[clamp(56px,9vw,96px)] pt-[clamp(48px,8vw,80px)]"
				style={SETTLED}
			>
				{SCENE_CONTENTS.slice(1).map((Content, k) => {
					const scene = k + 1;
					return (
						<li key={scene}>
							<CaptionBody scene={scene} />
							<div className="mt-7">
								{scene === 1 && <p className="mb-3 text-xs text-(--ink-3)">Illustrative workspace with sample client details</p>}
								<ScaledFrame>
									<div
										inert
										aria-hidden="true"
										style={{ position: "relative", width: FRAME_W, height: FRAME_H }}
									>
										<WorkspaceFrame scene={scene}>
											<Content />
										</WorkspaceFrame>
										{scene === 1 && (
											<div style={{ position: "absolute", inset: 0, scale: 0.95, "--a1": "0" } as CSSProperties}>
												<OldWayCards />
											</div>
										)}
									</div>
								</ScaledFrame>
							</div>
						</li>
					);
				})}
			</ol>
		</>
	);
}

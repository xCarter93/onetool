import React from "react";
import { Composition, Folder } from "remotion";
import { FEATURE_VIDEOS, TOP_LEVEL_IDS, VIDEO_CONFIG } from "./compositions";

const composition = (key: string) => {
	const video = FEATURE_VIDEOS[key];
	return (
		<Composition
			key={key}
			id={video.id}
			component={video.component}
			durationInFrames={video.durationInFrames}
			fps={VIDEO_CONFIG.fps}
			width={VIDEO_CONFIG.width}
			height={VIDEO_CONFIG.height}
			defaultProps={{ theme: "light" }}
		/>
	);
};

export const RemotionRoot: React.FC = () => {
	return (
		<>
			{TOP_LEVEL_IDS.map(composition)}
			<Folder name="Features">
				{Object.keys(FEATURE_VIDEOS)
					.filter((key) => !TOP_LEVEL_IDS.includes(key as (typeof TOP_LEVEL_IDS)[number]))
					.map(composition)}
			</Folder>
		</>
	);
};

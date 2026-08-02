import React from "react";
import { Composition, Folder } from "remotion";
import { FEATURE_VIDEOS, VIDEO_CONFIG } from "./compositions";

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id={FEATURE_VIDEOS.showcase.id}
				component={FEATURE_VIDEOS.showcase.component}
				durationInFrames={FEATURE_VIDEOS.showcase.durationInFrames}
				fps={VIDEO_CONFIG.fps}
				width={VIDEO_CONFIG.width}
				height={VIDEO_CONFIG.height}
				defaultProps={{ theme: "light" }}
			/>
			<Folder name="Features">
				{Object.entries(FEATURE_VIDEOS)
					.filter(([key]) => key !== "showcase")
					.map(([key, video]) => (
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
					))}
			</Folder>
		</>
	);
};

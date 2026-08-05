import React from "react";
import { useCurrentFrame } from "remotion";
import { AppFrame } from "./app-frame";

/**
 * What a scene needs from the workspace shell around it. Scenes export one of
 * these next to their `<X>Content`, so the same description drives both the
 * standalone composition (AppFrame per scene) and the story reel (ONE persistent
 * AppFrame whose props are interpolated across chapters).
 *
 * `active` / `title` may be frame-driven — quote-to-paid walks Quotes → Invoices
 * mid-scene.
 */
export interface SceneShell {
	active: string | ((frame: number) => string);
	title: string | ((frame: number) => string);
	/**
	 * Optional fractional NAV index for the reel's gliding pill. Supply it when
	 * the scene changes nav section mid-scene and the move should be continuous
	 * rather than a jump; otherwise `active` is resolved to an exact index.
	 */
	activeIndex?: (frame: number) => number;
	/** Header controls. A component, so it can animate off the scene-local frame. */
	HeaderAction?: React.FC;
	/**
	 * Anything drawn at composition scale ON TOP of the shell (the quote scene's
	 * cursor). Rendered outside the content card in both hosts.
	 */
	Overlay?: React.FC;
}

export const resolveShellValue = (
	value: string | ((frame: number) => string),
	frame: number,
): string => (typeof value === "function" ? value(frame) : value);

/**
 * Standalone host: AppFrame(shell) around the scene's content. Scenes keep
 * exporting their full-scene component through this, so Showcase, the mobile
 * stacked players and the studio compositions are untouched by the reel work.
 */
export const SceneFrame: React.FC<{
	shell: SceneShell;
	children?: React.ReactNode;
	dotCanvas?: boolean;
}> = ({ shell, children, dotCanvas }) => {
	const frame = useCurrentFrame();
	const { HeaderAction, Overlay } = shell;
	return (
		<>
			<AppFrame
				active={resolveShellValue(shell.active, frame)}
				title={resolveShellValue(shell.title, frame)}
				headerRight={HeaderAction ? <HeaderAction /> : undefined}
				dotCanvas={dotCanvas}
			>
				{children}
			</AppFrame>
			{Overlay ? <Overlay /> : null}
		</>
	);
};

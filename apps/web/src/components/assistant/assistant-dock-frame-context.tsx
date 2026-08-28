"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";

/**
 * Lets a workspace surface put a contextual header on the assistant dock —
 * "Report assistant" on report pages. Last publisher wins; only one report
 * surface is mounted at a time. Mirrors ReportConfigApplyProvider (provider in
 * the shell, publisher hook at the surface).
 */

export interface AssistantDockFrame {
	title: string;
	description: string;
}

type PublishFrame = (frame: AssistantDockFrame) => () => void;

const FrameContext = createContext<AssistantDockFrame | null>(null);
// Separate from the value context on purpose: a combined one would change
// identity on every publish and re-run the publisher's effect forever.
const PublishContext = createContext<PublishFrame | null>(null);

export function AssistantDockFrameProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [frame, setFrame] = useState<AssistantDockFrame | null>(null);
	const publish = useCallback<PublishFrame>((next) => {
		setFrame(next);
		return () => setFrame((current) => (current === next ? null : current));
	}, []);
	return (
		<PublishContext.Provider value={publish}>
			<FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
		</PublishContext.Provider>
	);
}

/** The frame the mounted surface published, or null. */
export function useAssistantDockFrame(): AssistantDockFrame | null {
	return useContext(FrameContext);
}

/** Registers a frame for the calling component's lifetime; null publishes nothing. */
export function usePublishAssistantDockFrame(frame: AssistantDockFrame | null) {
	const publish = useContext(PublishContext);
	const title = frame?.title;
	const description = frame?.description;
	useEffect(() => {
		if (!publish || title === undefined || description === undefined) return;
		return publish({ title, description });
	}, [publish, title, description]);
}

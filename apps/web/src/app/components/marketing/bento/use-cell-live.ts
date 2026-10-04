"use client";
import { useSyncExternalStore, type RefObject } from "react";
import { useMotionPaused } from "../motion-pause";
import { useInView } from "../use-in-view";

const subscribe = (notify: () => void) => {
	document.addEventListener("visibilitychange", notify);
	return () => document.removeEventListener("visibilitychange", notify);
};
const tabVisible = () => !document.hidden;
const serverVisible = () => true;

/** True while the cell is near the viewport, the tab is foregrounded and motion isn't paused; gate all idle motion on this. */
export function useCellLive(ref: RefObject<Element | null>) {
	const inView = useInView(ref, { margin: "25% 0px" });
	const visible = useSyncExternalStore(subscribe, tabVisible, serverVisible);
	const paused = useMotionPaused();
	return inView && visible && !paused;
}

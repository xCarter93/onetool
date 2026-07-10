"use client";

import type { BuilderReportConfig } from "@onetool/backend/convex/reportConfigGeneration";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
	type RefObject,
} from "react";

/**
 * Bridge for the assistant's client-executed configureReport tool: the
 * report builder registers an apply handler while mounted; the assistant
 * panel invokes it when a tool result streams in (navigate-tool pattern).
 * At most one builder is mounted at a time, so a single holder suffices.
 * Structure mirrors use-screen-context.tsx (register callback + refs).
 */

type ApplyHandler = (config: BuilderReportConfig) => void;

interface ReportConfigApplyValue {
	register: (holder: RefObject<ApplyHandler>) => () => void;
	holder: RefObject<RefObject<ApplyHandler> | null>;
	/** Reactive: a report builder is mounted (drives the panel's context UI). */
	builderMounted: boolean;
}

const ReportConfigApplyContext = createContext<ReportConfigApplyValue | null>(
	null
);

export function ReportConfigApplyProvider({
	children,
}: {
	children: ReactNode;
}) {
	const holder = useRef<RefObject<ApplyHandler> | null>(null);
	const [builderMounted, setBuilderMounted] = useState(false);
	const register = useCallback((next: RefObject<ApplyHandler>) => {
		holder.current = next;
		setBuilderMounted(true);
		return () => {
			if (holder.current === next) {
				holder.current = null;
				setBuilderMounted(false);
			}
		};
	}, []);
	const value = useMemo(
		() => ({ register, holder, builderMounted }),
		[register, builderMounted]
	);
	return (
		<ReportConfigApplyContext.Provider value={value}>
			{children}
		</ReportConfigApplyContext.Provider>
	);
}

/** Reactive: true while a report builder is mounted anywhere in the tree. */
export function useReportBuilderMounted(): boolean {
	return useContext(ReportConfigApplyContext)?.builderMounted ?? false;
}

/** Register the mounted builder's apply handler for the lifetime of the component. */
export function useRegisterReportConfigApply(handler: ApplyHandler) {
	const ctx = useContext(ReportConfigApplyContext);
	const handlerRef = useRef(handler);
	useEffect(() => {
		handlerRef.current = handler;
	});
	useEffect(() => {
		if (!ctx) return;
		return ctx.register(handlerRef);
	}, [ctx]);
}

/** Returns an applier that forwards to the mounted builder; false if none.
 * Stable identity — the panel's consuming effect lists it as a dependency,
 * so a per-render closure would re-scan the whole thread on every render. */
export function useApplyReportConfig(): (
	config: BuilderReportConfig
) => boolean {
	const ctx = useContext(ReportConfigApplyContext);
	return useCallback(
		(config: BuilderReportConfig) => {
			const handler = ctx?.holder.current?.current;
			if (!handler) return false;
			handler(config);
			return true;
		},
		[ctx]
	);
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { SidebarMode } from "../components/sidebar/automation-sidebar";

type ConfigurableNodeType = Exclude<
	Extract<SidebarMode, { mode: "node-config" }>["nodeType"],
	"trigger"
>;

export function useSidebarState(hasPlaceholders: boolean) {
	const [isOpen, setIsOpen] = useState(false);
	const [mode, setMode] = useState<SidebarMode | null>(null);

	const openTriggerPicker = useCallback(() => {
		setMode({ mode: "trigger-picker" });
		setIsOpen(true);
	}, []);

	const openStepPicker = useCallback((placeholderNodeId: string) => {
		setMode({ mode: "step-picker", placeholderNodeId });
		setIsOpen(true);
	}, []);

	const openNodeConfig = useCallback(
		(nodeType: "trigger" | ConfigurableNodeType, nodeId?: string) => {
			if (nodeType === "trigger") {
				setMode({ mode: "node-config", nodeType: "trigger" });
			} else {
				setMode({
					mode: "node-config",
					nodeType,
					nodeId: nodeId || "",
				});
			}
			setIsOpen(true);
		},
		[]
	);

	const closeSidebar = useCallback(() => {
		setIsOpen(false);
		setMode(null);
	}, []);

	const handleTriggerTypeSelect = useCallback(() => {
		setMode({ mode: "node-config", nodeType: "trigger" });
		setIsOpen(true);
	}, []);

	const handleStepTypeSelect = useCallback(
		(stepType: ConfigurableNodeType, placeholderNodeId: string) => {
			setMode({
				mode: "node-config",
				nodeType: stepType,
				nodeId: placeholderNodeId,
			});
			setIsOpen(true);
		},
		[]
	);

	useEffect(() => {
		if (!hasPlaceholders && mode?.mode === "step-picker") {
			closeSidebar();
		}
	}, [closeSidebar, hasPlaceholders, mode]);

	return {
		isOpen,
		mode,
		openTriggerPicker,
		openStepPicker,
		openNodeConfig,
		closeSidebar,
		handleTriggerTypeSelect,
		handleStepTypeSelect,
	};
}

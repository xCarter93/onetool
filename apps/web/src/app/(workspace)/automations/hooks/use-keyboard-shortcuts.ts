"use client";

import { useEffect } from "react";

interface SelectedNodeState {
	type: string;
	id?: string;
}

interface KeyboardShortcutOptions {
	selectedNode: SelectedNodeState | null;
	onDeleteNode: (nodeId: string) => void;
	onDeleteTrigger: () => void;
	onUndo: () => void;
	onCloseSidebar: () => void;
	canUndo: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || tag === "select";
}

export function useKeyboardShortcuts({
	selectedNode,
	onDeleteNode,
	onDeleteTrigger,
	onUndo,
	onCloseSidebar,
	canUndo,
}: KeyboardShortcutOptions) {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (isTypingTarget(event.target)) return;

			if ((event.key === "Delete" || event.key === "Backspace") && selectedNode) {
				event.preventDefault();
				if (selectedNode.type === "trigger") {
					onDeleteTrigger();
					return;
				}
				if (selectedNode.id) {
					onDeleteNode(selectedNode.id);
				}
				return;
			}

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && canUndo) {
				event.preventDefault();
				onUndo();
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				onCloseSidebar();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		canUndo,
		onCloseSidebar,
		onDeleteNode,
		onDeleteTrigger,
		onUndo,
		selectedNode,
	]);
}

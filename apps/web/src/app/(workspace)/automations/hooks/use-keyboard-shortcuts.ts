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
	onRedo: () => void;
	onCloseSidebar: () => void;
	canUndo: boolean;
	canRedo: boolean;
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
	onRedo,
	onCloseSidebar,
	canUndo,
	canRedo,
}: KeyboardShortcutOptions) {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			// Suppress all canvas shortcuts (incl. Escape) while a modal/dialog is open.
			if (document.querySelector('[role="dialog"]')) return;
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

			// Redo: Cmd/Ctrl+Shift+Z, or Ctrl+Y (Windows convention)
			if (
				canRedo &&
				((event.metaKey || event.ctrlKey) &&
					((event.key.toLowerCase() === "z" && event.shiftKey) ||
						event.key.toLowerCase() === "y"))
			) {
				event.preventDefault();
				onRedo();
				return;
			}

			if (
				(event.metaKey || event.ctrlKey) &&
				event.key.toLowerCase() === "z" &&
				!event.shiftKey &&
				canUndo
			) {
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
		canRedo,
		canUndo,
		onCloseSidebar,
		onDeleteNode,
		onDeleteTrigger,
		onRedo,
		onUndo,
		selectedNode,
	]);
}

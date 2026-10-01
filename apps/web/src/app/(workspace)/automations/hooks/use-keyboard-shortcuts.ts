"use client";

import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { cameraMs, fitViewOptionsFor, type CanvasReserve } from "../components/flow/automation-flow";

interface SelectedNodeState {
	type: string;
	id?: string;
}

export interface KeyboardShortcutOptions {
	selectedNode: SelectedNodeState | null;
	reserve: CanvasReserve;
	onDeleteNode: (nodeId: string) => void;
	onDeleteTrigger: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onCloseSidebar: () => void;
	canUndo: boolean;
	canRedo: boolean;
}

// Base UI menus and selects let Backspace/Delete bubble to window, so the target decides.
const KEYBOARD_OWNERS =
	"input, textarea, select, [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], [role='combobox']";
// Escape still closes the panel from a field or a closed select; only an open popup keeps it.
const POPUP_OWNERS =
	"[role='menu'], [role='menuitem'], [role='listbox'], [role='option']";

function isKeyboardOwned(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || target.closest(KEYBOARD_OWNERS) !== null;
}

function isInPopup(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(POPUP_OWNERS) !== null;
}

/** Needs a ReactFlowProvider above. */
export function useKeyboardShortcuts({
	selectedNode,
	reserve,
	onDeleteNode,
	onDeleteTrigger,
	onUndo,
	onRedo,
	onCloseSidebar,
	canUndo,
	canRedo,
}: KeyboardShortcutOptions) {
	const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			// No defaultPrevented check: React Flow's useKeyPress prevents Cmd/Ctrl/Shift chords on document.
			if (event.isComposing) return;
			if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

			if (event.key === "Escape") {
				if (isInPopup(event.target)) return;
				event.preventDefault();
				onCloseSidebar();
				return;
			}

			if (isKeyboardOwned(event.target)) return;

			// React Flow's node wrapper only selects on Enter/Space; clicking the card
			// runs the same path as a mouse click (open config, or a ghost's insert).
			if (
				(event.key === "Enter" || event.key === " ") &&
				event.target instanceof HTMLElement &&
				event.target.matches(".react-flow__node")
			) {
				event.preventDefault();
				(event.target.firstElementChild as HTMLElement | null)?.click();
				return;
			}

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

			// Modified zoom keys belong to the browser.
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			// Shifted digits print different glyphs per layout, so match the physical key.
			if (event.shiftKey && event.code === "Digit1") {
				event.preventDefault();
				fitView(fitViewOptionsFor(reserve, cameraMs()));
			} else if (event.shiftKey && event.code === "Digit0") {
				event.preventDefault();
				zoomTo(1, { duration: cameraMs(200) });
			} else if (event.key === "+" || event.key === "=") {
				event.preventDefault();
				zoomIn({ duration: cameraMs(200) });
			} else if (event.key === "-") {
				event.preventDefault();
				zoomOut({ duration: cameraMs(200) });
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		canRedo,
		canUndo,
		fitView,
		onCloseSidebar,
		onDeleteNode,
		onDeleteTrigger,
		onRedo,
		onUndo,
		reserve,
		selectedNode,
		zoomIn,
		zoomOut,
		zoomTo,
	]);
}

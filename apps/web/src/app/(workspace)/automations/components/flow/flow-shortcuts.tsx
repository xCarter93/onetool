"use client";

import { useId, useSyncExternalStore } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";

const subscribeToPlatform = () => () => {};

/** The server has no navigator, so it renders Mac keys and the client corrects. */
export function useIsApplePlatform() {
	return useSyncExternalStore(
		subscribeToPlatform,
		() => /Mac|iPhone|iPad/.test(navigator.userAgent),
		() => true
	);
}

/** Display glyphs for `mod`, `shift`, and `backspace`; other keys render as written. */
export function useKeyGlyph() {
	const apple = useIsApplePlatform();
	return (key: string) => {
		if (key === "mod") return apple ? "⌘" : "Ctrl";
		if (key === "shift") return apple ? "⇧" : "Shift";
		if (key === "backspace") return apple ? "⌫" : "Backspace";
		return key;
	};
}

export function ShortcutKeys({ keys }: { keys: string[] }) {
	const glyph = useKeyGlyph();
	return (
		<KbdGroup>
			{keys.map((key) => (
				<Kbd key={key}>{glyph(key)}</Kbd>
			))}
		</KbdGroup>
	);
}

// Bindings live in hooks/use-keyboard-shortcuts.ts; keep this list in step with it.
const SHORTCUTS: { label: string; keys: string[] }[] = [
	{ label: "Zoom in", keys: ["+"] },
	{ label: "Zoom out", keys: ["-"] },
	{ label: "Zoom to fit", keys: ["shift", "1"] },
	{ label: "Zoom to 100%", keys: ["shift", "0"] },
	{ label: "Undo", keys: ["mod", "Z"] },
	{ label: "Redo", keys: ["mod", "shift", "Z"] },
	{ label: "Delete selected step", keys: ["backspace"] },
	{ label: "Close panel", keys: ["Esc"] },
];

export function FlowShortcuts({ className }: { className?: string }) {
	const titleId = useId();
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Keyboard shortcuts"
						className={className}
					/>
				}
			>
				<Keyboard />
			</PopoverTrigger>
			<PopoverContent align="end" aria-labelledby={titleId}>
				<PopoverHeader>
					<PopoverTitle id={titleId}>Keyboard shortcuts</PopoverTitle>
				</PopoverHeader>
				<dl className="flex flex-col gap-2 text-sm">
					{SHORTCUTS.map((shortcut) => (
						<div key={shortcut.label} className="flex items-center justify-between gap-4">
							<dt className="text-muted-foreground">{shortcut.label}</dt>
							<dd>
								<ShortcutKeys keys={shortcut.keys} />
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

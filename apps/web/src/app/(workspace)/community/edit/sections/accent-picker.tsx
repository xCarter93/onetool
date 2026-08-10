"use client";

import { useState } from "react";
import { Check, Loader2, Pipette } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
	COMMUNITY_ACCENT_PRESETS,
	isAccentHex,
	normalizeAccent,
	resolveAccent,
} from "@/lib/community-accent";
import type { CommunityColorMode } from "@/lib/community-theme";
import { cn } from "@/lib/utils";
import { extractLogoColor } from "./extract-logo-color";

interface AccentPickerProps {
	accent: string;
	setAccent: (accent: string) => void;
	colorMode: CommunityColorMode;
	/** The uploaded logo, when there is one — the source for "Use my logo". */
	logoUrl: string | null;
}

export function AccentPicker({
	accent,
	setAccent,
	colorMode,
	logoUrl,
}: AccentPickerProps) {
	const toast = useToast();
	const selected = normalizeAccent(accent);
	const resolved = resolveAccent(selected, colorMode);
	const [typed, setTyped] = useState(selected);
	const [isReadingLogo, setIsReadingLogo] = useState(false);

	// The text field owns what is being typed; the swatches own what is chosen.
	// Re-sync when the choice moved somewhere else (a preset, the logo, the well).
	const [lastSelected, setLastSelected] = useState(selected);
	if (selected !== lastSelected) {
		setLastSelected(selected);
		setTyped(selected);
	}

	function commit(value: string) {
		if (isAccentHex(value)) setAccent(normalizeAccent(value));
	}

	async function useLogoColor() {
		if (!logoUrl) return;
		setIsReadingLogo(true);
		try {
			setAccent(normalizeAccent(await extractLogoColor(logoUrl)));
		} catch {
			toast.error(
				"Couldn't read your logo",
				"Pick a color below instead.",
			);
		} finally {
			setIsReadingLogo(false);
		}
	}

	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-medium text-foreground">Accent color</p>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Used for buttons, links and highlights. Shown here as it will
					appear on your {colorMode} page.
				</p>
			</div>

			<fieldset>
				<legend className="sr-only">Preset accent colors</legend>
				<div className="flex flex-wrap gap-2">
					{COMMUNITY_ACCENT_PRESETS.map((preset) => {
						const isSelected = preset.hex === selected;
						return (
							<label
								key={preset.hex}
								title={preset.name}
								className={cn(
									"grid size-8 cursor-pointer place-items-center rounded-full transition-shadow duration-200",
									"focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
									isSelected &&
										"ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
								)}
								style={{
									backgroundColor: resolveAccent(
										preset.hex,
										colorMode,
									).primary,
								}}
							>
								<input
									type="radio"
									name="community-accent"
									value={preset.hex}
									checked={isSelected}
									onChange={() => setAccent(preset.hex)}
									className="sr-only"
								/>
								<span className="sr-only">{preset.name}</span>
								{isSelected && (
									<Check
										className="size-4"
										style={{
											color: resolveAccent(
												preset.hex,
												colorMode,
											).primaryFg,
										}}
										aria-hidden
									/>
								)}
							</label>
						);
					})}
				</div>
			</fieldset>

			<div className="flex flex-wrap items-center gap-2">
				<label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border">
					<span className="sr-only">Custom accent color</span>
					<input
						type="color"
						value={selected}
						onChange={(event) => setAccent(event.target.value)}
						className="absolute -inset-2 size-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0"
					/>
				</label>
				<Input
					value={typed}
					onChange={(event) => {
						setTyped(event.target.value);
						commit(event.target.value);
					}}
					onBlur={() => setTyped(selected)}
					aria-label="Accent color hex value"
					spellCheck={false}
					className="w-28 font-mono text-sm"
				/>
				{logoUrl && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={useLogoColor}
						disabled={isReadingLogo}
					>
						{isReadingLogo ? (
							<Loader2 className="size-3.5 animate-spin" aria-hidden />
						) : (
							<Pipette className="size-3.5" aria-hidden />
						)}
						Use my logo
					</Button>
				)}
			</div>

			{resolved.adjusted && (
				<p className="text-xs text-muted-foreground">
					Nudged {colorMode === "light" ? "darker" : "lighter"} so links
					and labels stay readable on your {colorMode} page. Your logo and
					photos are untouched.
				</p>
			)}
		</div>
	);
}

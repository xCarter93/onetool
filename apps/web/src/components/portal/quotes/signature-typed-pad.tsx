"use client";

/**
 * Typed-mode signature pad. Renders a Caveat live preview while the client
 * types, debounces (~150ms — Pitfall: re-render flicker on every keystroke),
 * and on settle calls `renderTypedSignatureToPng` to materialize the PNG +
 * raw payload. Min length is enforced inside renderTypedSignatureToPng
 * (>= 2 non-whitespace chars).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderTypedSignatureToPng } from "@/lib/portal/quotes/render-typed-signature";

import type { SignaturePayload } from "./signature-card";

export interface SignatureTypedPadProps {
	value: SignaturePayload;
	onChange: (next: SignaturePayload) => void;
	disabled?: boolean;
}

const DEBOUNCE_MS = 150;

export function SignatureTypedPad({
	value,
	onChange,
	disabled = false,
}: SignatureTypedPadProps) {
	const initialName =
		value.mode === "typed" && value.isUsable ? value.rawData.typedName : "";
	const [typed, setTyped] = useState<string>(initialName);
	const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (settleTimer.current) clearTimeout(settleTimer.current);
		};
	}, []);

	const settle = useCallback(
		async (name: string) => {
			if (disabled) return;
			if (name.trim().length < 2) {
				onChange({
					mode: "typed",
					dataUrl: null,
					rawData: null,
					isUsable: false,
				});
				return;
			}
			try {
				const { dataUrl, raw } = await renderTypedSignatureToPng(name);
				onChange({
					mode: "typed",
					dataUrl,
					rawData: { typedName: raw.typedName, font: "Caveat" },
					isUsable: true,
				});
			} catch {
				onChange({
					mode: "typed",
					dataUrl: null,
					rawData: null,
					isUsable: false,
				});
			}
		},
		[disabled, onChange],
	);

	const handleChange = (next: string) => {
		setTyped(next);
		if (settleTimer.current) clearTimeout(settleTimer.current);
		settleTimer.current = setTimeout(() => {
			void settle(next);
		}, DEBOUNCE_MS);
	};

	return (
		<div className="space-y-3">
			<div>
				<Label htmlFor="typed-signature-input" className="text-xs">
					Type your full legal name as your electronic signature
				</Label>
				<Input
					id="typed-signature-input"
					type="text"
					value={typed}
					onChange={(e) => handleChange(e.target.value)}
					maxLength={100}
					disabled={disabled}
					placeholder="Your full legal name"
					autoComplete="off"
					autoCorrect="off"
					spellCheck={false}
					aria-label="Typed signature"
				/>
			</div>
			<div
				aria-label="Typed signature preview"
				className="flex h-24 items-center rounded-xl border border-border bg-background px-4"
				style={{
					fontFamily: '"Caveat", cursive',
					fontSize: 36,
					fontWeight: 600,
					color: "var(--acme, #0f172a)",
					minHeight: 96,
				}}
			>
				{typed.trim().length > 0 ? typed : (
					<span className="text-muted-foreground" style={{ fontFamily: "inherit" }}>
						Your signature will appear here
					</span>
				)}
			</div>
		</div>
	);
}

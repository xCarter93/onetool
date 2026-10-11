"use client";

import { useEffect, useRef } from "react";

import {
	SignaturePad,
	SignaturePadArea,
	SignaturePadClear,
	SignaturePadControls,
	SignaturePadGuide,
	SignaturePadPlaceholder,
	SignaturePadUndo,
	signaturePadToDataURL,
	type SignaturePadApi,
	type SignaturePadStroke,
} from "@/components/reui/signature-pad";

import type { SignaturePayload } from "./signature-card";

// Rejects a stray tap, which signature pads otherwise count as a signature.
const MIN_POINTS = 5;

const NON_USABLE_DRAWN: SignaturePayload = {
	mode: "drawn",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

export interface SignatureDrawnPadProps {
	value: SignaturePayload;
	onChange: (next: SignaturePayload) => void;
	disabled?: boolean;
}

export function SignatureDrawnPad({
	value,
	onChange,
	disabled = false,
}: SignatureDrawnPadProps) {
	const padRef = useRef<SignaturePadApi>(null);
	const lastEmittedRef = useRef<SignaturePayload | null>(null);

	// A non-usable value we didn't emit is a parent reset (stale 409, tab
	// switch), so the ink has to go too.
	useEffect(() => {
		if (value !== lastEmittedRef.current && !value.isUsable) {
			padRef.current?.clear();
		}
	}, [value]);

	const handleValueChange = (strokes: SignaturePadStroke[]) => {
		if (disabled) return;
		const points = strokes.reduce((n, s) => n + s.points.length, 0);
		const next: SignaturePayload =
			points >= MIN_POINTS
				? {
						mode: "drawn",
						// Exports default to black ink, so a dark-mode signer still
						// produces a signature that shows on paper and white thumbs.
						dataUrl: signaturePadToDataURL(strokes),
						rawData: { format: "reui-signature-pad", strokes },
						isUsable: true,
					}
				: NON_USABLE_DRAWN;
		lastEmittedRef.current = next;
		onChange(next);
	};

	return (
		<SignaturePad
			apiRef={padRef}
			onValueChange={handleValueChange}
			disabled={disabled}
		>
			<SignaturePadArea aria-label="Draw your signature">
				<SignaturePadGuide />
				<SignaturePadPlaceholder />
				<SignaturePadControls position="top-end">
					<SignaturePadUndo variant="ghost" />
					<SignaturePadClear variant="ghost" />
				</SignaturePadControls>
			</SignaturePadArea>
		</SignaturePad>
	);
}

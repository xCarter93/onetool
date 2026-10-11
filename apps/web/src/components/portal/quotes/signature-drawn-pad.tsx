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
	getSignaturePadBounds,
	signaturePadToDataURL,
	type SignaturePadApi,
	type SignaturePadPoint,
	type SignaturePadStroke,
} from "@/components/reui/signature-pad";

import type { SignaturePayload } from "./signature-card";

// Rejects a stray tap, which signature pads otherwise count as a signature.
const MIN_POINTS = 5;
const EXPORT_PADDING = 8;

const NON_USABLE_DRAWN: SignaturePayload = {
	mode: "drawn",
	dataUrl: null,
	rawData: null,
	isUsable: false,
};

// Pointer capture keeps recording past the pad's edge, where the ink is
// clipped from view, so the crop stops at what the signer saw.
function exportVisibleInk(strokes: SignaturePadStroke[], area: HTMLElement) {
	const ink = getSignaturePadBounds(strokes)!;
	const x = Math.max(0, Math.floor(ink.x - EXPORT_PADDING));
	const y = Math.max(0, Math.floor(ink.y - EXPORT_PADDING));
	const right = Math.min(
		area.clientWidth,
		Math.ceil(ink.x + ink.width + EXPORT_PADDING),
	);
	const bottom = Math.min(
		area.clientHeight,
		Math.ceil(ink.y + ink.height + EXPORT_PADDING),
	);
	const shifted = strokes.map((stroke) => ({
		...stroke,
		points: stroke.points.map(
			([px, py, size]): SignaturePadPoint => [px - x, py - y, size],
		),
	}));
	// Exports default to black ink, so a dark-mode signer still produces a
	// signature that shows on paper and white thumbs.
	return signaturePadToDataURL(shifted, { width: right - x, height: bottom - y });
}

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
	const areaRef = useRef<HTMLDivElement>(null);
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
						dataUrl: exportVisibleInk(strokes, areaRef.current!),
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
			<SignaturePadArea ref={areaRef} aria-label="Draw your signature">
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

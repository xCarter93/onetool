"use client";

/**
 * SignatureCard — Type | Draw tabs container. Holds the SignaturePayload
 * contract that downstream consumers (Plan 14-04 API route, Plan 14-05
 * approval rail) submit to /api/portal/quotes/[quoteId]/approve.
 *
 * SSR safety: SignatureCanvasPad is dynamically imported with ssr:false
 * because signature_pad touches the DOM at construction.
 *
 * Tab change resets state and emits a non-usable payload tagged with the
 * new mode, so parent state stays consistent without us reaching into the
 * pads.
 */

import dynamic from "next/dynamic";
import { useCallback } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SignatureTypedPad } from "./signature-typed-pad";

const SignatureCanvasPad = dynamic(
	() =>
		import("./signature-canvas-pad").then(
			(m) => m.SignatureCanvasPad,
		),
	{
		ssr: false,
		loading: () => (
			<div className="h-40 animate-pulse rounded-xl bg-muted" />
		),
	},
);

export type SignatureStroke = {
	points: Array<{ x: number; y: number; time: number; pressure?: number }>;
	dotSize?: number;
	minWidth?: number;
	maxWidth?: number;
	penColor?: string;
};

export type SignaturePayload =
	| {
			mode: "typed";
			dataUrl: string;
			rawData: { typedName: string; font: "Caveat" };
			isUsable: true;
	  }
	| {
			mode: "drawn";
			dataUrl: string;
			rawData: { strokes: SignatureStroke[] };
			isUsable: true;
	  }
	| {
			mode: "typed" | "drawn";
			dataUrl: null;
			rawData: null;
			isUsable: false;
	  };

export interface SignatureCardProps {
	value: SignaturePayload;
	onChange: (next: SignaturePayload) => void;
	disabled?: boolean;
}

export function SignatureCard({
	value,
	onChange,
	disabled = false,
}: SignatureCardProps) {
	const activeTab = value.mode;

	const handleTabChange = useCallback(
		(next: string) => {
			if (next !== "typed" && next !== "drawn") return;
			if (next === value.mode) return;
			onChange({
				mode: next,
				dataUrl: null,
				rawData: null,
				isUsable: false,
			});
		},
		[onChange, value.mode],
	);

	return (
		<Tabs
			value={activeTab}
			onValueChange={handleTabChange}
			className="w-full"
		>
			<TabsList className="w-full">
				<TabsTrigger value="typed" disabled={disabled}>
					Type
				</TabsTrigger>
				<TabsTrigger value="drawn" disabled={disabled}>
					Draw
				</TabsTrigger>
			</TabsList>
			<TabsContent value="typed" className="pt-3">
				<SignatureTypedPad
					value={value}
					onChange={onChange}
					disabled={disabled}
				/>
			</TabsContent>
			<TabsContent value="drawn" className="pt-3">
				<SignatureCanvasPad
					value={value}
					onChange={onChange}
					disabled={disabled}
				/>
			</TabsContent>
		</Tabs>
	);
}

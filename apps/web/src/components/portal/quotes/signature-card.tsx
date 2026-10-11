"use client";

/**
 * SignatureCard — Type | Draw tabs container. Holds the SignaturePayload
 * contract that downstream consumers (Plan 14-04 API route, Plan 14-05
 * approval rail) submit to /api/portal/quotes/[quoteId]/approve.
 *
 * Tab change resets state and emits a non-usable payload tagged with the
 * new mode, so parent state stays consistent without us reaching into the
 * pads.
 */

import { useCallback } from "react";

import type { SignaturePadStroke } from "@/components/reui/signature-pad";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SignatureDrawnPad } from "./signature-drawn-pad";
import { SignatureTypedPad } from "./signature-typed-pad";

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
			rawData: { format: "reui-signature-pad"; strokes: SignaturePadStroke[] };
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
				<SignatureDrawnPad
					value={value}
					onChange={onChange}
					disabled={disabled}
				/>
			</TabsContent>
		</Tabs>
	);
}

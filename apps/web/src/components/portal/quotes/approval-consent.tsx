"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";

import type { SignaturePayload } from "./signature-card";

const TERMS_COPY = "I accept the scope and terms above.";
const TYPED_INTENT_COPY =
	"By typing my name and clicking Approve, I am signing this quote electronically. I agree that my electronic signature is the legal equivalent of my manual signature on this quote.";

export interface ApprovalConsentProps {
	signatureMode: SignaturePayload["mode"];
	termsAccepted: boolean;
	onTermsAcceptedChange: (accepted: boolean) => void;
	intentAffirmed: boolean;
	onIntentAffirmedChange: (affirmed: boolean) => void;
	disabled?: boolean;
}

export function ApprovalConsent({
	signatureMode,
	termsAccepted,
	onTermsAcceptedChange,
	intentAffirmed,
	onIntentAffirmedChange,
	disabled = false,
}: ApprovalConsentProps) {
	const id = useId();

	return (
		<div className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<Checkbox
					id={`${id}-terms`}
					aria-label={TERMS_COPY}
					checked={termsAccepted}
					onCheckedChange={(checked) => onTermsAcceptedChange(checked === true)}
					disabled={disabled}
				/>
				<FieldLabel htmlFor={`${id}-terms`} className="font-normal">
					{TERMS_COPY}
				</FieldLabel>
			</Field>

			{signatureMode === "typed" && (
				<Field orientation="horizontal" className="items-start">
					<Checkbox
						id={`${id}-intent`}
						aria-label={TYPED_INTENT_COPY}
						checked={intentAffirmed}
						onCheckedChange={(checked) =>
							onIntentAffirmedChange(checked === true)
						}
						disabled={disabled}
						className="mt-0.5"
					/>
					<FieldLabel
						htmlFor={`${id}-intent`}
						className="font-normal leading-relaxed text-muted-foreground"
					>
						{TYPED_INTENT_COPY}
					</FieldLabel>
				</Field>
			)}
		</div>
	);
}

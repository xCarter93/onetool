"use client";

import { useEffect, useId, useRef } from "react";
import { useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/components/ui/input-group";

/** Domain every org receiving address lives under. Mirrors the backend constant. */
export const INBOUND_EMAIL_DOMAIN = "inbound.onetool.biz";

export const MIN_LOCAL_PART_LENGTH = 3;
export const MAX_LOCAL_PART_LENGTH = 24;

/** Mirrors `RESERVED_LOCAL_PARTS` in the backend. The server stays authoritative. */
const RESERVED_LOCAL_PARTS = new Set([
	"support",
	"noreply",
	"new",
	"create",
	"edit",
	"delete",
	"admin",
	"api",
	"login",
	"signup",
	"signin",
	"signout",
	"logout",
	"settings",
	"profile",
	"dashboard",
	"help",
	"terms",
	"privacy",
	"about",
	"contact",
	"home",
	"index",
	"showcase",
	"interest",
]);

/** Lowercases and drops anything outside [a-z0-9-] so the field can only hold legal input. */
export function normalizeLocalPart(raw: string): string {
	return raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/** Turns a business name into a starting-point local part. */
export function slugifyLocalPart(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_LOCAL_PART_LENGTH)
		.replace(/-+$/g, "");
}

/** Client mirror of `validateReceivingLocalPart` — instant feedback only. */
export function validateLocalPart(localPart: string): string | null {
	if (!/^[a-z0-9-]+$/.test(localPart)) {
		return "Address can only contain lowercase letters, numbers, and hyphens";
	}
	if (localPart.length < MIN_LOCAL_PART_LENGTH) {
		return `Address must be at least ${MIN_LOCAL_PART_LENGTH} characters long`;
	}
	if (localPart.length > MAX_LOCAL_PART_LENGTH) {
		return `Address must be ${MAX_LOCAL_PART_LENGTH} characters or less`;
	}
	if (localPart.startsWith("-") || localPart.endsWith("-")) {
		return "Address cannot start or end with a hyphen";
	}
	if (localPart.startsWith("org-")) {
		return 'Address cannot start with "org-"';
	}
	if (RESERVED_LOCAL_PARTS.has(localPart)) {
		return "This address is reserved. Please choose another.";
	}
	return null;
}

/** Local part of the org's stored address ("" when unset). Callers decide how to treat `org-…` generated ones. */
export function localPartOf(receivingAddress: string | undefined): string {
	if (!receivingAddress) return "";
	return receivingAddress.split("@")[0] ?? "";
}

export type ReceivingAddressStatus =
	| "empty"
	| "current"
	| "invalid"
	| "checking"
	| "available"
	| "taken";

export interface ReceivingAddressState {
	status: ReceivingAddressStatus;
	/** Helper/error copy for the current status, or null when there's nothing to say. */
	message: string | null;
	/** True only when the value is a claimable change from `currentLocalPart`. */
	canClaim: boolean;
}

interface ReceivingAddressFieldProps {
	value: string;
	onChange: (next: string) => void;
	/** The local part the org already owns; equal values skip the availability check. */
	currentLocalPart?: string;
	disabled?: boolean;
	/**
	 * Set false while the org row is still being provisioned — the availability
	 * query requires an active org and would otherwise throw.
	 */
	enabled?: boolean;
	id?: string;
	placeholder?: string;
	/** Reports the tri-state to the parent so it can gate its own save affordance. */
	onStatusChange?: (state: ReceivingAddressState) => void;
	className?: string;
}

export function ReceivingAddressField({
	value,
	onChange,
	currentLocalPart,
	disabled = false,
	enabled = true,
	id,
	placeholder = "your-business",
	onStatusChange,
	className,
}: ReceivingAddressFieldProps) {
	const generatedId = useId();
	const inputId = id ?? `receiving-address-${generatedId}`;
	const debounced = useDebouncedValue(value, 300);

	const clientError = value ? validateLocalPart(value) : null;
	const isCurrent = Boolean(currentLocalPart) && value === currentLocalPart;

	// Skip the round trip whenever the answer is already knowable client-side.
	const shouldQuery =
		enabled &&
		!disabled &&
		!isCurrent &&
		debounced.length >= MIN_LOCAL_PART_LENGTH &&
		validateLocalPart(debounced) === null;

	const availability = useQuery(
		api.organizations.checkReceivingAddressAvailable,
		shouldQuery ? { localPart: debounced } : "skip",
	);

	let status: ReceivingAddressStatus;
	let message: string | null = null;

	if (!value) {
		status = "empty";
	} else if (isCurrent) {
		status = "current";
		message = "This is your current address.";
	} else if (clientError) {
		status = "invalid";
		// Stay quiet about the length floor while the user is still typing it out.
		message =
			value.length < MIN_LOCAL_PART_LENGTH && /^[a-z0-9-]+$/.test(value)
				? null
				: clientError;
	} else if (!enabled) {
		status = "empty";
	} else if (debounced !== value || availability === undefined) {
		status = "checking";
	} else if (availability.available) {
		status = "available";
		message = "That address is available.";
	} else {
		status = "taken";
		message = availability.reason ?? "This address is already taken";
	}

	const canClaim = status === "available";

	// Held in a ref so an inline callback prop can't retrigger the effect forever.
	const onStatusChangeRef = useRef(onStatusChange);
	useEffect(() => {
		onStatusChangeRef.current = onStatusChange;
	}, [onStatusChange]);

	useEffect(() => {
		onStatusChangeRef.current?.({ status, message, canClaim });
	}, [status, message, canClaim]);

	const isNegative = status === "invalid" || status === "taken";
	const helperId = `${inputId}-helper`;

	return (
		<div className={cn("space-y-1.5", className)}>
			<InputGroup className={cn(disabled && "opacity-70")}>
				<InputGroupInput
					id={inputId}
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					maxLength={MAX_LOCAL_PART_LENGTH}
					aria-invalid={isNegative || undefined}
					aria-describedby={message ? helperId : undefined}
					onChange={(event) => onChange(normalizeLocalPart(event.target.value))}
				/>
				<InputGroupAddon align="inline-end" className="gap-2">
					<InputGroupText className="text-muted-foreground">
						@{INBOUND_EMAIL_DOMAIN}
					</InputGroupText>
					{status === "checking" ? (
						<Loader2
							className="size-4 shrink-0 animate-spin text-muted-foreground"
							aria-hidden="true"
						/>
					) : status === "available" ? (
						<Check
							className="size-4 shrink-0 text-success"
							aria-hidden="true"
						/>
					) : isNegative ? (
						<X className="size-4 shrink-0 text-destructive" aria-hidden="true" />
					) : null}
				</InputGroupAddon>
			</InputGroup>

			{message && (
				<p
					id={helperId}
					role={isNegative ? "alert" : undefined}
					className={cn(
						"text-xs",
						status === "available"
							? "text-success"
							: isNegative
								? "text-destructive"
								: "text-muted-foreground",
					)}
				>
					{message}
				</p>
			)}
		</div>
	);
}

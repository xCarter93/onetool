"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { AddressAutofill as AddressAutofillType } from "@mapbox/search-js-react";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { env } from "@/env";

// @mapbox/search-js-react touches `document` at module init, so it can't be statically imported in an RSC graph.
const AddressAutofill = dynamic<
	React.ComponentProps<typeof AddressAutofillType>
>(() => import("@mapbox/search-js-react").then((m) => m.AddressAutofill), {
	ssr: false,
});

/**
 * Structured address data returned from Mapbox Address Autofill.
 *
 * Field name mapping from Mapbox response:
 * - address_line1 → streetAddress
 * - place → city
 * - region → state (Mapbox uses "region" for state/province)
 * - postcode → zipCode (Mapbox uses "postcode" for postal/zip code)
 * - country → country
 * - geometry.coordinates → [longitude, latitude]
 * - full_address → formattedAddress
 */
export interface AddressData {
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country: string;
	latitude: number | null;
	longitude: number | null;
	formattedAddress: string;
}

/**
 * Expected structure of Mapbox Address Autofill response
 */
interface MapboxFeature {
	properties?: {
		address_line1?: string;
		place?: string;
		region?: string;
		postcode?: string;
		country?: string;
		full_address?: string;
		place_name?: string;
	};
	geometry?: {
		coordinates?: [number, number]; // [longitude, latitude]
	};
}

interface MapboxResponse {
	features?: MapboxFeature[];
}

/**
 * Runtime validation for Mapbox response structure
 * Returns true if the response matches the expected structure
 */
function isValidMapboxResponse(response: unknown): response is MapboxResponse {
	if (!response || typeof response !== "object") {
		return false;
	}

	const res = response as Record<string, unknown>;

	// features is optional but if present must be an array
	if (res.features !== undefined && !Array.isArray(res.features)) {
		return false;
	}

	return true;
}

/**
 * Validates that a feature has the expected structure
 */
function isValidMapboxFeature(feature: unknown): feature is MapboxFeature {
	if (!feature || typeof feature !== "object") {
		return false;
	}

	const feat = feature as Record<string, unknown>;

	// properties is optional but if present must be an object
	if (feat.properties !== undefined && typeof feat.properties !== "object") {
		return false;
	}

	// geometry is optional but if present must have coordinates array
	if (feat.geometry !== undefined) {
		if (typeof feat.geometry !== "object" || feat.geometry === null) {
			return false;
		}
		const geom = feat.geometry as Record<string, unknown>;
		if (geom.coordinates !== undefined && !Array.isArray(geom.coordinates)) {
			return false;
		}
	}

	return true;
}

interface AddressAutocompleteProps {
	/** Current street address value (controlled) */
	value: string;
	/** Called when user types in the input */
	onChange: (value: string) => void;
	/** Called when user selects an address from suggestions */
	onAddressSelect: (address: AddressData) => void;
	/** Input placeholder text */
	placeholder?: string;
	/** Whether the input is disabled */
	disabled?: boolean;
	/** Additional class names for the input */
	className?: string;
	/** Input name for form submission */
	name?: string;
	/** Input id for label association */
	id?: string;
	/** Whether the input has validation errors */
	"aria-invalid"?: boolean;
	/** onBlur handler for form integration */
	onBlur?: React.FocusEventHandler<HTMLInputElement>;
	/**
	 * ISO 3166-1 alpha-2 country code to restrict address suggestions.
	 * @default "US"
	 * @example "US", "CA", "GB", "AU"
	 */
	countryCode?: string;
}

/**
 * Address autocomplete input using Mapbox Address Autofill.
 * Provides address suggestions as user types and returns structured
 * address data with geocoding (lat/lng) when an address is selected.
 *
 * Falls back to a regular Input if Mapbox token is not configured.
 */
export const AddressAutocomplete = React.forwardRef<
	HTMLInputElement,
	AddressAutocompleteProps
>(function AddressAutocomplete(
	{
		value,
		onChange,
		onAddressSelect,
		placeholder = "Start typing an address...",
		disabled = false,
		className,
		name,
		id,
		"aria-invalid": ariaInvalid,
		onBlur,
		countryCode = "US",
	},
	ref
) {
	const { resolvedTheme } = useTheme();
	const inputRef = React.useRef<HTMLInputElement>(null);

	// Forward ref to input
	React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

	// Check if Mapbox is available
	const mapboxToken = env.NEXT_PUBLIC_MAPBOX_API_KEY;
	const isMapboxAvailable = Boolean(mapboxToken);

	// Handle address selection from Mapbox
	const handleRetrieve = React.useCallback(
		(response: unknown) => {
			// Runtime validation of Mapbox response structure
			if (!isValidMapboxResponse(response)) {
				console.warn(
					"AddressAutocomplete: Invalid Mapbox response structure",
					response
				);
				return;
			}

			const feature = response.features?.[0];
			if (!feature) return;

			// Validate feature structure
			if (!isValidMapboxFeature(feature)) {
				console.warn(
					"AddressAutocomplete: Invalid Mapbox feature structure",
					feature
				);
				return;
			}

			const properties = feature.properties ?? {};
			const coordinates = feature.geometry?.coordinates;

			// Build address data with field name mapping:
			// - region → state (Mapbox naming)
			// - postcode → zipCode (Mapbox naming)
			const addressData: AddressData = {
				streetAddress: properties.address_line1 ?? "",
				city: properties.place ?? "",
				state: properties.region ?? "",
				zipCode: properties.postcode ?? "",
				country: properties.country ?? "United States",
				latitude: coordinates?.[1] ?? null,
				longitude: coordinates?.[0] ?? null,
				formattedAddress:
					properties.full_address ?? properties.place_name ?? "",
			};

			onAddressSelect(addressData);
		},
		[onAddressSelect]
	);

	// Theme configuration for Mapbox suggestions popover
	// Uses CSS custom properties to match the design system
	const theme = React.useMemo(
		() => ({
			variables: {
				fontFamily: "inherit",
				unit: "14px",
				padding: "0.5em 0.75em",
				borderRadius: "0.5rem",
				boxShadow:
					"0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
				// Colors based on theme - matching design system
				colorBackground:
					resolvedTheme === "dark"
						? "hsl(240 10% 3.9%)" // dark background
						: "hsl(0 0% 100%)", // light background
				colorBackgroundHover:
					resolvedTheme === "dark"
						? "hsl(240 3.7% 15.9%)" // dark muted
						: "hsl(240 4.8% 95.9%)", // light muted
				colorText:
					resolvedTheme === "dark"
						? "hsl(0 0% 98%)" // dark foreground
						: "hsl(240 10% 3.9%)", // light foreground
				colorPrimary: "hsl(221.2 83.2% 53.3%)", // primary blue
			},
		}),
		[resolvedTheme]
	);

	// Fallback to regular input if Mapbox not available
	if (!isMapboxAvailable) {
		return (
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className={className}
				name={name}
				id={id}
				aria-invalid={ariaInvalid}
				onBlur={onBlur}
				autoComplete="street-address"
			/>
		);
	}

	return (
		<AddressAutofill
			accessToken={mapboxToken}
			onRetrieve={handleRetrieve}
			theme={theme}
			options={{
				language: "en",
				country: countryCode,
			}}
		>
			<Input
				ref={inputRef}
				autoComplete="street-address"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className={cn(className)}
				name={name}
				id={id}
				aria-invalid={ariaInvalid}
				onBlur={onBlur}
			/>
		</AddressAutofill>
	);
});

AddressAutocomplete.displayName = "AddressAutocomplete";

export { AddressAutocomplete as default };

/**
 * Mapbox forward-geocoding helpers shared by the backfill migration and the
 * per-property geocode action. Pure network + string work: no ctx, no db.
 */

interface MapboxGeocodeResponse {
	features?: Array<{
		center?: [number, number]; // [longitude, latitude]
		place_name?: string;
	}>;
}

export type GeocodeResult = {
	latitude: number;
	longitude: number;
	formattedAddress: string;
};

/**
 * Geocode an address with the Mapbox Geocoding API. Returns null (never throws)
 * on a transport error, a non-2xx, or no match — callers treat geocoding as
 * best-effort enrichment.
 */
export async function geocodeAddress(
	address: string,
	mapboxToken: string
): Promise<GeocodeResult | null> {
	const encodedAddress = encodeURIComponent(address);
	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1&country=US`;

	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(`Geocoding API error: ${response.status}`);
			return null;
		}

		const data = (await response.json()) as MapboxGeocodeResponse;
		const feature = data.features?.[0];

		if (!feature || !feature.center) {
			return null;
		}

		return {
			longitude: feature.center[0],
			latitude: feature.center[1],
			formattedAddress: feature.place_name || address,
		};
	} catch (error) {
		console.error("Geocoding error:", error);
		return null;
	}
}

/** Build a full address string from clientProperties fields. */
export function buildPropertyAddress(property: {
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country?: string;
}): string {
	const parts = [
		property.streetAddress,
		property.city,
		property.state,
		property.zipCode,
	].filter(Boolean);

	if (property.country) {
		parts.push(property.country);
	}

	return parts.join(", ");
}

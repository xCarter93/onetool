/**
 * Encoded-polyline (precision 5) codec + downsampler. Used to shrink a
 * full-resolution route geometry before embedding it in a GET query string —
 * Mapbox's CDN rejects over-long URLs with 414.
 */

export type LngLat = [number, number];

export function decodePolyline5(encoded: string): LngLat[] {
	const coordinates: LngLat[] = [];
	let index = 0;
	let lat = 0;
	let lng = 0;

	while (index < encoded.length) {
		let result = 0;
		let shift = 0;
		let byte: number;
		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lat += result & 1 ? ~(result >> 1) : result >> 1;

		result = 0;
		shift = 0;
		do {
			byte = encoded.charCodeAt(index++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20);
		lng += result & 1 ? ~(result >> 1) : result >> 1;

		coordinates.push([lng / 1e5, lat / 1e5]);
	}

	return coordinates;
}

function encodeValue(current: number, previous: number): string {
	let value = current - previous;
	value = value < 0 ? ~(value << 1) : value << 1;
	let output = "";
	while (value >= 0x20) {
		output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
		value >>= 5;
	}
	output += String.fromCharCode(value + 63);
	return output;
}

export function encodePolyline5(coordinates: LngLat[]): string {
	let output = "";
	let prevLat = 0;
	let prevLng = 0;
	for (const [lng, lat] of coordinates) {
		const latE5 = Math.round(lat * 1e5);
		const lngE5 = Math.round(lng * 1e5);
		output += encodeValue(latE5, prevLat) + encodeValue(lngE5, prevLng);
		prevLat = latE5;
		prevLng = lngE5;
	}
	return output;
}

/** Uniformly sample down to at most `maxPoints`, keeping endpoints when possible. */
export function downsample(points: LngLat[], maxPoints: number): LngLat[] {
	if (maxPoints <= 0) return [];
	if (points.length <= maxPoints) return points;
	if (maxPoints === 1) return [points[0]];
	const sampled: LngLat[] = [];
	const step = (points.length - 1) / (maxPoints - 1);
	for (let i = 0; i < maxPoints; i++) {
		sampled.push(points[Math.round(i * step)]);
	}
	return sampled;
}

/**
 * Re-encode a route polyline so the encoded form fits in a GET query string.
 * Halves the point budget until it fits.
 */
export function shrinkPolylineForQuery(
	encoded: string,
	maxEncodedLength = 4000
): string {
	if (encoded.length <= maxEncodedLength) return encoded;
	const points = decodePolyline5(encoded);
	let budget = 500;
	let result = encodePolyline5(downsample(points, budget));
	while (result.length > maxEncodedLength && budget > 16) {
		budget = Math.floor(budget / 2);
		result = encodePolyline5(downsample(points, budget));
	}
	return result;
}

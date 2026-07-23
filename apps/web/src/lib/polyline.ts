/**
 * Decode an encoded polyline (Google/Mapbox polyline algorithm) into
 * [longitude, latitude] pairs for MapLibre. Mapbox Directions/Optimization
 * default to precision 5.
 */
export function decodePolyline(
	encoded: string,
	precision = 5
): [number, number][] {
	const factor = 10 ** precision;
	const coordinates: [number, number][] = [];
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

		coordinates.push([lng / factor, lat / factor]);
	}

	return coordinates;
}

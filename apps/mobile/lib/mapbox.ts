// Guarded loader for @rnmapbox/maps. The native module only exists in builds
// made after the P4 `expo prebuild --clean`; requiring it inside an older dev
// client throws at import time. Resolving it here lets the Routes screen fall
// back to a "new build required" notice instead of crashing the whole app.
import type * as MapboxNS from "@rnmapbox/maps";

const token = process.env.EXPO_PUBLIC_MAPBOX_API_KEY;

let mod: typeof MapboxNS | null = null;
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	mod = require("@rnmapbox/maps") as typeof MapboxNS;
	if (token) {
		mod.default.setAccessToken(token);
	}
} catch {
	mod = null;
}

/** Null when the native module or the public token is unavailable. */
export const MapboxModule = token ? mod : null;

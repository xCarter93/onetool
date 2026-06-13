import { useWindowDimensions } from "react-native";

export type Device = "phone" | "ipad";
export type Orientation = "portrait" | "landscape";

export interface DeviceInfo {
	device: Device;
	orientation: Orientation;
	width: number;
	height: number;
}

// Responsive hook (RESP-01). Backed by useWindowDimensions so it re-renders on
// rotate — required over Dimensions.get(), which is a one-time snapshot.
// P19 ships the hook; P26 consumes it for iPad layouts.
export function useDevice(): DeviceInfo {
	const { width, height } = useWindowDimensions();
	return {
		device: width >= 768 ? "ipad" : "phone",
		orientation: width > height ? "landscape" : "portrait",
		width,
		height,
	};
}

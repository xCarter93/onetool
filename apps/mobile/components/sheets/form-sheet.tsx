import { Modal } from "react-native";
import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { useTokens } from "@/lib/theme";

export interface FormSheetProps {
	visible: boolean;
	/**
	 * The sheet's "soft" dismiss path: iPad scrim tap / hardware back, or the
	 * phone sheet's native swipe-down (only reachable when `dirty` is false —
	 * see below). Callers gate this themselves (confirm-if-dirty) before
	 * actually closing, so it never bypasses unsaved-input protection.
	 */
	onDismiss: () => void;
	/**
	 * SwiftUI's `interactiveDismissDisabled` can't separate swipe-to-dismiss
	 * from backdrop-tap-to-dismiss, so on the phone this BLOCKS both while
	 * true rather than asking first — the header close button is the only
	 * way out of a dirty form there. On iPad the scrim tap still calls
	 * `onDismiss` (which the caller can turn into a confirm), so it asks.
	 */
	dirty?: boolean;
	/** Single fraction snap point ("78%"), sized to the sheet's tallest state (open keyboard included). */
	snapPoint: string;
	children: React.ReactNode;
}

// Shared presentation for the money sheets (line-item, record-payment,
// send-preview, extend-valid-until): phone uses a native detented sheet,
// iPad reuses the app's existing centered-card idiom (overlayOptions +
// CenteredModal) rather than trusting SwiftUI's own iPad sheet sizing.
export function FormSheet({
	visible,
	onDismiss,
	dirty,
	snapPoint,
	children,
}: FormSheetProps) {
	const { device } = useDevice();
	const t = useTokens();

	if (device === "ipad") {
		return (
			<Modal
				visible={visible}
				transparent
				animationType="fade"
				onRequestClose={onDismiss}
			>
				<CenteredModal onScrimPress={onDismiss} maxHeight="88%">
					{children}
				</CenteredModal>
			</Modal>
		);
	}

	return (
		<BottomSheet
			index={visible ? 0 : -1}
			snapPoints={[snapPoint]}
			enablePanDownToClose={!dirty}
			handleComponent={null}
			onDismiss={onDismiss}
			backgroundStyle={{ backgroundColor: t.bg }}
		>
			{children}
		</BottomSheet>
	);
}

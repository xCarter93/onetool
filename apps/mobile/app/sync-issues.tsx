import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { CenteredModal } from "@/components/ipad/centered-modal";
import { useDevice } from "@/lib/use-device";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { isOpen } from "@/lib/offline/queue";
import { isPaymentOp, opStatusText, sortSyncIssues } from "@/lib/offline/sync-copy";
import type { StoredOp } from "@/lib/offline/db";

// Sync issues form-sheet — same chrome idiom as /org-switch and /notifications
// (sheet options in app/_layout.tsx). Lists every open outbox op, most severe
// (payment conflicts) first, per the sync status line's tap target.
export default function SyncIssuesSheet() {
	const t = useTokens();
	const insets = useSafeAreaInsets();
	const { device } = useDevice();
	const { ops, retry, confirmReplay, resolve } = useOffline();
	// Seeded once (lazy) — react-hooks/purity forbids Date.now() during render.
	const [now] = useState(() => Date.now());

	const open = useMemo(() => ops.filter(isOpen), [ops]);
	const sorted = useMemo(() => sortSyncIssues(open, now), [open, now]);

	const handleResolve = (op: StoredOp) => {
		if (isPaymentOp(op)) {
			Alert.alert(
				"This cash is still in hand",
				`${op.display.title} was collected but never reached the server. Marking it handled here does not record the payment. Only continue once it's been returned to the customer or recorded on the web.`,
				[
					{ text: "Not yet", style: "cancel" },
					{
						text: "It's been handled",
						style: "destructive",
						onPress: () => void resolve(op.id),
					},
				],
			);
			return;
		}
		Alert.alert(
			"Mark handled?",
			`${op.display.title} will stop appearing in your sync issues. This does not send it to the server.`,
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Mark handled", style: "destructive", onPress: () => void resolve(op.id) },
			],
		);
	};

	const content = (
		<>
			<View style={styles.header}>
				<View style={{ flex: 1 }} />
				<Text style={[styles.title, { color: t.ink }]}>Sync issues</Text>
				<View style={styles.headerAction}>
					<Pressable
						onPress={() => router.back()}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel="Close"
						style={styles.closeBtn}
					>
						<X size={22} color={t.sub} />
					</Pressable>
				</View>
			</View>

			{sorted.length === 0 ? (
				<View style={styles.empty}>
					<Text style={[styles.emptyTitle, { color: t.ink }]}>Nothing needs your attention</Text>
					<Text style={[styles.emptySub, { color: t.sub }]}>
						Everything on this phone has synced.
					</Text>
				</View>
			) : (
				<ScrollView
					style={styles.list}
					contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.lg }]}
				>
					{sorted.map((op, index) => {
						const status = opStatusText(op, now);
						const payment = isPaymentOp(op);
						const needsConfirm = op.status === "pending" && !op.replayConfirmed && status.tone === "warning";
						const showRetry = op.status === "failed" || op.status === "conflict";
						return (
							<View
								key={op.id}
								style={[
									styles.row,
									{ borderTopColor: t.lineSoft, borderTopWidth: index === 0 ? 0 : 1 },
								]}
							>
								{payment && (op.status === "conflict" || op.status === "failed") ? (
									<Text style={[styles.paymentFlag, { color: t.danger }]}>PAYMENT — NEEDS ATTENTION</Text>
								) : null}
								<Text style={[styles.rowTitle, { color: t.ink }]}>{op.display.title}</Text>
								{op.display.detail ? (
									<Text style={[styles.rowDetail, { color: t.sub }]}>{op.display.detail}</Text>
								) : null}
								<Text style={[styles.rowStatus, { color: t[status.tone] }]}>{status.text}</Text>
								<Text style={[styles.rowMeta, { color: t.faint }]}>
									Captured {new Date(op.capturedAt).toLocaleString()}
								</Text>
								{(showRetry || needsConfirm) && (
									<View style={styles.actions}>
										{showRetry ? (
											<Button title="Retry" size="sm" variant="solid" onPress={() => void retry(op.id)} />
										) : null}
										{needsConfirm ? (
											<Button
												title="Send anyway"
												size="sm"
												variant="secondary"
												onPress={() => void confirmReplay(op.id)}
											/>
										) : null}
										{showRetry ? (
											<Button
												title="Mark handled"
												size="sm"
												variant="secondary"
												onPress={() => handleResolve(op)}
											/>
										) : null}
									</View>
								)}
							</View>
						);
					})}
				</ScrollView>
			)}
		</>
	);

	if (device === "ipad") {
		return (
			<CenteredModal onScrimPress={() => router.back()} maxHeight="86%">
				<View style={[styles.padCard, { backgroundColor: t.card }]}>{content}</View>
			</CenteredModal>
		);
	}

	return (
		<View style={[styles.container, { backgroundColor: t.card, paddingBottom: insets.bottom }]}>
			<View style={[styles.grabber, { backgroundColor: t.border }]} />
			{content}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		overflow: "hidden",
	},
	padCard: {
		flex: 1,
		paddingTop: spacing.gutter,
	},
	grabber: {
		alignSelf: "center",
		width: 44,
		height: 5,
		borderRadius: radii.pill,
		marginTop: 10,
		marginBottom: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingBottom: spacing.gutter,
	},
	title: {
		flex: 2,
		textAlign: "center",
		fontSize: type.h2,
		lineHeight: 30,
		fontFamily: fontFamily.bold,
	},
	headerAction: {
		flex: 1,
		alignItems: "flex-end",
	},
	closeBtn: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: spacing.md,
	},
	row: {
		paddingVertical: spacing.md,
		gap: 3,
	},
	paymentFlag: {
		fontSize: type.eyebrow,
		fontFamily: fontFamily.bold,
		letterSpacing: 0.6,
		marginBottom: 2,
	},
	rowTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
	},
	rowDetail: {
		fontSize: type.sm,
		fontFamily: fontFamily.regular,
	},
	rowStatus: {
		fontSize: type.sm,
		fontFamily: fontFamily.medium,
		marginTop: 2,
	},
	rowMeta: {
		fontSize: type.xs,
		fontFamily: fontFamily.regular,
		marginTop: 2,
	},
	actions: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.xl,
	},
	emptyTitle: {
		fontSize: type.body,
		fontFamily: fontFamily.semibold,
		textAlign: "center",
	},
	emptySub: {
		fontSize: type.sm,
		fontFamily: fontFamily.regular,
		textAlign: "center",
	},
});

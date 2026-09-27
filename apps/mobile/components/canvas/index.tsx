import React from "react";
import {
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type ScrollViewProps,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import {
	Building2,
	Check,
	ChevronRight,
	ClipboardCheck,
	FileText,
	Folder,
	Receipt,
	Route as RouteIcon,
	type LucideIcon,
} from "lucide-react-native";
import { Badge } from "@/components/ui";
import { NOTCH_CLEARANCE } from "@/components/frame/notch";
import { fontFamily, frame, recordTint, type RecordKind, useTokens } from "@/lib/theme";

// Web workspace display components for screens inside the canvas
// (workspace-theme.css: page header, panel, metrics, record tabs, stepper).

export const GUTTER = 16;

/** Wrapper for a fixed header above a list: clears the notch, list starts 12 below. */
export const CANVAS_HEADER = { paddingTop: NOTCH_CLEARANCE, paddingHorizontal: GUTTER } as const;
export { NOTCH_CLEARANCE };

export const KIND_ICON: Record<RecordKind, LucideIcon> = {
	client: Building2,
	project: Folder,
	quote: FileText,
	invoice: Receipt,
	route: RouteIcon,
	task: ClipboardCheck,
};

/** Scroll body for a canvas screen: 16px gutters, notch clearance, 32px foot. */
export const CanvasScroll = React.forwardRef<ScrollView, ScrollViewProps>(
	function CanvasScroll({ contentContainerStyle, ...rest }, ref) {
		return (
			<ScrollView
				ref={ref}
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={[styles.scroll, contentContainerStyle]}
				{...rest}
			/>
		);
	},
);

/** 24/600 title with an optional line under it and actions on the right; hairline below. */
export function PageHeader({
	title,
	subtitle,
	eyebrow,
	right,
	hairline = true,
}: {
	title: string;
	subtitle?: React.ReactNode;
	eyebrow?: React.ReactNode;
	right?: React.ReactNode;
	hairline?: boolean;
}) {
	const t = useTokens();
	return (
		<View
			style={[
				styles.pageHeader,
				hairline && { borderBottomWidth: 1, borderBottomColor: t.line, paddingBottom: 14 },
			]}
		>
			<View style={styles.flexShrink}>
				{eyebrow ? <View style={styles.pageEyebrow}>{eyebrow}</View> : null}
				<Text style={[styles.pageTitle, { color: t.ink }]} accessibilityRole="header">
					{title}
				</Text>
				{subtitle ? (
					typeof subtitle === "string" ? (
						<Text style={[styles.pageSub, { color: t.sub }]}>{subtitle}</Text>
					) : (
						subtitle
					)
				) : null}
			</View>
			{right ? <View style={styles.pageRight}>{right}</View> : null}
		</View>
	);
}

/** 11px uppercase group label; its -8 foot assumes a 16px-gap parent, pulling it onto its panel. */
export function SectionLabel({
	title,
	right,
	action,
	onAction,
}: {
	title: string;
	right?: React.ReactNode;
	action?: string;
	onAction?: () => void;
}) {
	const t = useTokens();
	return (
		<View style={styles.sectionLabel}>
			<Text style={[styles.sectionLabelText, { color: t.sub }]} accessibilityRole="header">
				{title}
			</Text>
			{action ? (
				<Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
					<Text style={[styles.link, { color: t.frostedInk }]}>{action}</Text>
				</Pressable>
			) : (
				right
			)}
		</View>
	);
}

/** Bordered 8px white panel; children are separated by `lineSoft` hairlines. */
export function Panel({
	children,
	style,
	header,
}: {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	header?: React.ReactNode;
}) {
	const t = useTokens();
	const rows = React.Children.toArray(children).filter(Boolean);
	return (
		<View style={[styles.panel, { backgroundColor: t.card, borderColor: t.line }, style]}>
			{header}
			{rows.map((row, i) => (
				<View
					key={i}
					style={i > 0 || header ? { borderTopWidth: 1, borderTopColor: t.lineSoft } : undefined}
				>
					{row}
				</View>
			))}
		</View>
	);
}

/** Panel title row: 14/600 title, optional right-hand link. */
export function PanelHeader({
	title,
	action,
	onAction,
	right,
}: {
	title: string;
	action?: string;
	onAction?: () => void;
	right?: React.ReactNode;
}) {
	const t = useTokens();
	return (
		<View style={styles.panelHeader}>
			<Text style={[styles.panelTitle, { color: t.ink }]} accessibilityRole="header" numberOfLines={1}>
				{title}
			</Text>
			{action ? (
				<Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
					<Text style={[styles.link, { color: t.frostedInk }]}>{action}</Text>
				</Pressable>
			) : (
				right
			)}
		</View>
	);
}

export function TypeTile({ kind, size = 32 }: { kind: RecordKind; size?: number }) {
	const tint = recordTint[kind];
	const Icon = KIND_ICON[kind];
	return (
		<View
			style={[
				styles.tile,
				{ width: size, height: size, borderRadius: size >= 40 ? 10 : 8, backgroundColor: tint.bg },
			]}
		>
			<Icon size={Math.round(size / 2)} color={tint.fg} strokeWidth={2} />
		</View>
	);
}

/** List row inside a panel: type tile, title and meta, status badge, chevron. */
export function RecordRow({
	kind,
	leading,
	title,
	subtitle,
	status,
	statusLabel,
	right,
	onPress,
	chevron = true,
	selected = false,
	muted = false,
}: {
	kind?: RecordKind;
	leading?: React.ReactNode;
	title: string;
	subtitle?: string;
	status?: string;
	statusLabel?: string;
	right?: React.ReactNode;
	onPress?: () => void;
	chevron?: boolean;
	selected?: boolean;
	muted?: boolean;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			disabled={!onPress}
			accessibilityRole={onPress ? "button" : undefined}
			accessibilityState={selected ? { selected: true } : undefined}
			style={({ pressed }) => [
				styles.row,
				selected && { backgroundColor: t.frostedBg, boxShadow: `inset 2px 0 0 ${t.primary}` },
				pressed && { backgroundColor: t.muted },
			]}
		>
			{leading ?? (kind ? <TypeTile kind={kind} /> : null)}
			<View style={styles.rowBody}>
				<Text
					style={[
						styles.rowTitle,
						{ color: muted ? t.sub : t.ink },
						muted && styles.struck,
					]}
					numberOfLines={1}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text style={[styles.rowSub, { color: t.sub }]} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{status ? <Badge status={status} label={statusLabel} /> : null}
			{right}
			{chevron && onPress ? <ChevronRight size={16} color={t.input} strokeWidth={2} /> : null}
		</Pressable>
	);
}

export interface MetricCell {
	icon?: LucideIcon;
	label: string;
	value: string;
	tone?: "default" | "danger" | "success";
	onPress?: () => void;
}

/** Web's metric strip: joined bordered cells, 12px label over a 22/600 value. */
export function MetricStrip({
	cells,
	footer,
	onFooterPress,
}: {
	cells: MetricCell[];
	footer?: React.ReactNode;
	onFooterPress?: () => void;
}) {
	const t = useTokens();
	const toneColor = { default: t.ink, danger: t.danger, success: t.success };
	return (
		<View style={[styles.panel, { backgroundColor: t.card, borderColor: t.line }]}>
			<View style={styles.metricRow}>
				{cells.map((c, i) => (
					<Pressable
						key={c.label}
						onPress={c.onPress}
						disabled={!c.onPress}
						accessibilityRole={c.onPress ? "button" : undefined}
						accessibilityLabel={`${c.label}, ${c.value}`}
						style={({ pressed }) => [
							styles.metricCell,
							i > 0 && { borderLeftWidth: 1, borderLeftColor: t.line },
							pressed && { backgroundColor: t.muted },
						]}
					>
						<View style={styles.metricLabelRow}>
							{c.icon ? <c.icon size={13} color={t.sub} strokeWidth={2} /> : null}
							<Text style={[styles.metricLabel, { color: t.sub }]} numberOfLines={1}>
								{c.label}
							</Text>
						</View>
						<Text
							style={[styles.metricValue, { color: toneColor[c.tone ?? "default"] }]}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							{c.value}
						</Text>
					</Pressable>
				))}
			</View>
			{footer ? (
				<Pressable
					onPress={onFooterPress}
					disabled={!onFooterPress}
					accessibilityRole={onFooterPress ? "button" : undefined}
					style={({ pressed }) => [
						styles.metricFooter,
						{ borderTopColor: t.line, backgroundColor: pressed ? t.secondary : t.muted },
					]}
				>
					<View style={styles.flexFill}>{footer}</View>
					{onFooterPress ? <ChevronRight size={15} color={t.sub} strokeWidth={2} /> : null}
				</Pressable>
			) : null}
		</View>
	);
}

export interface UnderlineTab<V extends string> {
	value: V;
	label: string;
	count?: number | string;
}

/** Web record tabs: 40px, 18px gap, primary label and 2px underline on the active tab. */
export function UnderlineTabs<V extends string>({
	tabs,
	value,
	onChange,
}: {
	tabs: readonly UnderlineTab<V>[];
	value: V;
	onChange: (v: V) => void;
}) {
	const t = useTokens();
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={[styles.tabsScroll, { borderBottomColor: t.line }]}
			contentContainerStyle={styles.tabs}
			accessibilityRole="tablist"
		>
			{tabs.map((tab) => {
				const active = tab.value === value;
				return (
					<Pressable
						key={tab.value}
						onPress={() => onChange(tab.value)}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
						style={[styles.tab, active && { boxShadow: `inset 0 -2px 0 ${frame.indicator}` }]}
					>
						<Text
							style={[
								styles.tabLabel,
								{
									color: active ? t.frostedInk : t.sub,
									fontFamily: active ? fontFamily.semibold : fontFamily.medium,
								},
							]}
						>
							{tab.label}
						</Text>
						{tab.count !== undefined ? (
							<View style={[styles.tabCount, { backgroundColor: t.secondary }]}>
								<Text style={[styles.tabCountText, { color: t.sub }]}>{tab.count}</Text>
							</View>
						) : null}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

/** Label / value line for attribute panels (web's record detail list). */
export function AttributeRow({
	icon: Icon,
	label,
	value,
	valueColor,
	onPress,
	right,
}: {
	icon?: LucideIcon;
	label: string;
	value: React.ReactNode;
	valueColor?: string;
	onPress?: () => void;
	right?: React.ReactNode;
}) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			disabled={!onPress}
			accessibilityRole={onPress ? "button" : undefined}
			style={({ pressed }) => [styles.attr, pressed && { backgroundColor: t.muted }]}
		>
			<View style={styles.attrLabel}>
				{Icon ? <Icon size={15} color={t.sub} strokeWidth={2} /> : null}
				<Text style={[styles.attrLabelText, { color: t.sub }]} numberOfLines={1}>
					{label}
				</Text>
			</View>
			{typeof value === "string" ? (
				<Text
					style={[styles.attrValue, { color: valueColor ?? (onPress ? t.frostedInk : t.ink) }]}
					numberOfLines={2}
				>
					{value}
				</Text>
			) : (
				<View style={styles.attrValueBox}>{value}</View>
			)}
			{right}
		</Pressable>
	);
}

export interface StepperStep {
	label: string;
	caption?: string;
	state: "done" | "current" | "todo";
}

/** Web's square lifecycle stepper: numbered 24px squares joined by a line. */
export function Stepper({ steps }: { steps: StepperStep[] }) {
	const t = useTokens();
	return (
		<View style={styles.stepper} accessibilityRole="progressbar">
			{steps.map((s, i) => {
				const reached = s.state !== "todo";
				return (
					<View key={s.label} style={styles.step} accessibilityLabel={`${s.label}, ${s.state === "done" ? "done" : s.state === "current" ? "current" : "not started"}`}>
						<View style={styles.stepTrack}>
							<View
								style={[
									styles.stepLine,
									{ backgroundColor: i === 0 ? "transparent" : reached ? t.brand : t.line },
								]}
							/>
							<View
								style={[
									styles.stepBox,
									s.state === "done"
										? { backgroundColor: t.brand, borderColor: t.brand }
										: s.state === "current"
											? { backgroundColor: t.card, borderColor: t.brand }
											: { backgroundColor: t.card, borderColor: t.input },
								]}
							>
								{s.state === "done" ? (
									<Check size={13} color="#ffffff" strokeWidth={3} />
								) : (
									<Text
										style={[
											styles.stepNum,
											{ color: s.state === "current" ? t.frostedInk : t.sub },
										]}
									>
										{i + 1}
									</Text>
								)}
							</View>
							<View
								style={[
									styles.stepLine,
									{
										backgroundColor:
											i === steps.length - 1
												? "transparent"
												: steps[i + 1].state !== "todo"
													? t.brand
													: t.line,
									},
								]}
							/>
						</View>
						<Text
							style={[
								styles.stepLabel,
								{ color: reached ? t.ink : t.sub, fontFamily: reached ? fontFamily.semibold : fontFamily.medium },
							]}
							numberOfLines={1}
						>
							{s.label}
						</Text>
						<Text style={[styles.stepCaption, { color: t.sub }]} numberOfLines={1}>
							{s.caption ?? "—"}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

/** Composed empty state inside a panel. */
export function EmptyPanel({
	icon: Icon,
	title,
	body,
	action,
}: {
	icon?: LucideIcon;
	title: string;
	body?: string;
	action?: React.ReactNode;
}) {
	const t = useTokens();
	return (
		<View style={[styles.panel, styles.empty, { backgroundColor: t.card, borderColor: t.line }]}>
			{Icon ? (
				<View style={[styles.emptyIcon, { backgroundColor: t.secondary }]}>
					<Icon size={20} color={t.sub} strokeWidth={2} />
				</View>
			) : null}
			<Text style={[styles.emptyTitle, { color: t.ink }]}>{title}</Text>
			{body ? <Text style={[styles.emptyBody, { color: t.sub }]}>{body}</Text> : null}
			{action ? <View style={styles.emptyAction}>{action}</View> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	scroll: {
		paddingHorizontal: GUTTER,
		paddingTop: NOTCH_CLEARANCE,
		paddingBottom: 32,
		gap: 16,
	},
	flexShrink: {
		flexShrink: 1,
		minWidth: 0,
	},
	flexFill: {
		flex: 1,
		minWidth: 0,
	},
	pageHeader: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 12,
	},
	pageEyebrow: {
		marginBottom: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	pageTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 24,
		lineHeight: 31,
		letterSpacing: -0.6,
	},
	pageSub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 2,
	},
	pageRight: {
		flexShrink: 0,
	},
	sectionLabel: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 2,
		marginBottom: -8,
	},
	sectionLabelText: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		letterSpacing: 0.9,
		textTransform: "uppercase",
	},
	link: {
		fontFamily: fontFamily.medium,
		fontSize: 12.5,
	},
	panel: {
		borderWidth: 1,
		borderRadius: 8,
		overflow: "hidden",
	},
	panelHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	panelTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		flexShrink: 1,
	},
	tile: {
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
		paddingVertical: 11,
		paddingHorizontal: 12,
		minHeight: 56,
	},
	rowBody: {
		flex: 1,
		minWidth: 0,
	},
	rowTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
	},
	struck: {
		textDecorationLine: "line-through",
	},
	rowSub: {
		fontFamily: fontFamily.regular,
		fontSize: 12.5,
		marginTop: 2,
		fontVariant: ["tabular-nums"],
	},
	metricRow: {
		flexDirection: "row",
	},
	metricCell: {
		flex: 1,
		paddingHorizontal: 12,
		paddingVertical: 11,
		gap: 6,
		minWidth: 0,
	},
	metricLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	metricLabel: {
		fontFamily: fontFamily.medium,
		fontSize: 12,
		flexShrink: 1,
	},
	metricValue: {
		fontFamily: fontFamily.semibold,
		fontSize: 22,
		fontVariant: ["tabular-nums"],
	},
	metricFooter: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderTopWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
		minHeight: 40,
	},
	tabsScroll: {
		borderBottomWidth: 1,
		flexGrow: 0,
	},
	tabs: {
		gap: 18,
	},
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
	},
	tabLabel: {
		fontSize: 13.5,
	},
	tabCount: {
		borderRadius: 4,
		paddingHorizontal: 5,
		paddingVertical: 1,
	},
	tabCountText: {
		fontFamily: fontFamily.semibold,
		fontSize: 11,
		fontVariant: ["tabular-nums"],
	},
	attr: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 11,
		minHeight: 44,
	},
	attrLabel: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		width: 116,
		flexShrink: 0,
	},
	attrLabelText: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		flexShrink: 1,
	},
	attrValue: {
		flex: 1,
		fontFamily: fontFamily.medium,
		fontSize: 13.5,
		fontVariant: ["tabular-nums"],
	},
	attrValueBox: {
		flex: 1,
		minWidth: 0,
	},
	stepper: {
		flexDirection: "row",
	},
	step: {
		flex: 1,
		alignItems: "center",
		gap: 4,
	},
	stepTrack: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "stretch",
	},
	stepLine: {
		flex: 1,
		height: 1.5,
	},
	stepBox: {
		width: 24,
		height: 24,
		borderRadius: 4,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	stepNum: {
		fontFamily: fontFamily.semibold,
		fontSize: 12,
		fontVariant: ["tabular-nums"],
	},
	stepLabel: {
		fontSize: 12.5,
		marginTop: 4,
	},
	stepCaption: {
		fontFamily: fontFamily.regular,
		fontSize: 11.5,
		fontVariant: ["tabular-nums"],
	},
	empty: {
		alignItems: "center",
		paddingVertical: 28,
		paddingHorizontal: 20,
		gap: 6,
	},
	emptyIcon: {
		width: 40,
		height: 40,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	emptyTitle: {
		fontFamily: fontFamily.semibold,
		fontSize: 15,
		textAlign: "center",
	},
	emptyBody: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		lineHeight: 19,
		textAlign: "center",
		maxWidth: 300,
	},
	emptyAction: {
		marginTop: 8,
	},
});

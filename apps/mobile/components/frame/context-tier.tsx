import React, { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { MenuView } from "@expo/ui/community/menu";
import type { Button } from "@expo/ui/swift-ui";
import { Plus, Sparkles } from "lucide-react-native";
import { fontFamily, useTokens } from "@/lib/theme";
import { runTrayAction, useFocusedChrome, type TrayAction } from "@/lib/shell-chrome";
import { usePermissions } from "@/lib/use-permissions";
import { useOnlineAction } from "@/lib/offline/hooks";

export interface CreateMenuItem {
	key: string;
	label: string;
	symbol: React.ComponentProps<typeof Button>["systemImage"];
	run: () => void;
}

export function useCreateItems(): CreateMenuItem[] {
	const router = useRouter();
	const { can, isLoading } = usePermissions();
	const onlineAction = useOnlineAction();
	return useMemo(() => {
		if (isLoading) return [];
		const open = (label: string, href: string) => () =>
			onlineAction(label, () => router.push(href as Href));
		const items: CreateMenuItem[] = [];
		// Quotes and projects need a client picked, which needs client access.
		const canPickClient = can("clients", "view");
		if (can("quotes", "modify") && canPickClient) {
			items.push({ key: "quote", label: "New quote", symbol: "doc.text", run: open("New quote", "/quote/new") });
		}
		if (can("clients", "modify")) {
			items.push({ key: "client", label: "New client", symbol: "building.2", run: open("New client", "/client/new") });
		}
		if (can("tasks", "modify")) {
			items.push({ key: "task", label: "New task", symbol: "checklist", run: open("New task", "/tasks/form") });
		}
		if (can("projects", "modify") && canPickClient) {
			items.push({ key: "project", label: "New project", symbol: "folder", run: open("New project", "/project/new") });
		}
		return items;
	}, [can, isLoading, onlineAction, router]);
}

/**
 * Glass strip above the native tab bar: assistant + create on tab roots, the
 * focused record's action tray elsewhere. iOS renders two copies (regular and
 * inline), so all state lives in the shell-chrome store.
 */
export function ShellAccessory() {
	const router = useRouter();
	const pathname = usePathname();
	const createItems = useCreateItems();
	const focused = useFocusedChrome();
	const inline = NativeTabs.BottomAccessory.usePlacement() === "inline";
	const openAssistant = () =>
		router.push({ pathname: "/assistant" as never, params: { ctx: pathname } });

	if (focused?.chrome.tray?.length) {
		return (
			<ActionTray
				actions={focused.chrome.tray}
				inline={inline}
				onRun={(key) => runTrayAction(focused.key, key)}
				onAssistant={openAssistant}
			/>
		);
	}
	return <Composer inline={inline} onAssistant={openAssistant} createItems={createItems} />;
}

function AssistantButton({ onPress, label }: { onPress: () => void; label?: string }) {
	const t = useTokens();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel="Ask the assistant"
			hitSlop={6}
			style={({ pressed }) => [styles.ghost, label ? styles.grow : null, pressed && styles.pressed]}
		>
			<Sparkles size={18} color={t.primary} strokeWidth={2} />
			{label ? (
				<Text style={[styles.askText, { color: t.sub }]} numberOfLines={1}>
					{label}
				</Text>
			) : null}
		</Pressable>
	);
}

function CreateMenu({ items }: { items: CreateMenuItem[] }) {
	const t = useTokens();
	if (items.length === 0) return null;
	return (
		<MenuView
			title="Create"
			onPressAction={({ nativeEvent }) => items.find((i) => i.key === nativeEvent.event)?.run()}
			actions={items.map((i) => ({ id: i.key, title: i.label, image: i.symbol }))}
		>
			<View style={styles.ghost} accessible accessibilityRole="button" accessibilityLabel="Create">
				<Plus size={20} color={t.ink} strokeWidth={2.2} />
			</View>
		</MenuView>
	);
}

function Composer({
	inline,
	onAssistant,
	createItems,
}: {
	inline: boolean;
	onAssistant: () => void;
	createItems: CreateMenuItem[];
}) {
	return (
		<View style={[styles.row, inline && styles.rowInline]}>
			<AssistantButton onPress={onAssistant} label={inline ? undefined : "Ask OneTool…"} />
			<CreateMenu items={createItems} />
		</View>
	);
}

/** Record tier: the first action is the filled primary, then up to two secondaries. */
function ActionTray({
	actions,
	inline,
	onRun,
	onAssistant,
}: {
	actions: TrayAction[];
	inline: boolean;
	onRun: (key: string) => void;
	onAssistant: () => void;
}) {
	const t = useTokens();
	const [primary, ...rest] = actions;
	const press = (a: TrayAction) => {
		if (a.disabledReason) {
			Alert.alert(a.label, a.disabledReason);
			return;
		}
		onRun(a.key);
	};
	return (
		<View style={[styles.row, inline && styles.rowInline]}>
			{primary ? (
				<Pressable
					onPress={() => press(primary)}
					accessibilityRole="button"
					accessibilityLabel={primary.label}
					accessibilityState={{ disabled: !!primary.disabledReason }}
					style={({ pressed }) => [
						styles.primary,
						{ backgroundColor: pressed ? t.primarySolidPressed : t.primarySolid },
						primary.disabledReason ? styles.disabled : null,
					]}
				>
					<primary.icon size={16} color="#ffffff" strokeWidth={2.2} />
					<Text style={styles.primaryText} numberOfLines={1}>
						{primary.label}
					</Text>
				</Pressable>
			) : null}
			{inline
				? null
				: rest.slice(0, 2).map((a) => (
						<Pressable
							key={a.key}
							onPress={() => press(a)}
							accessibilityRole="button"
							accessibilityLabel={a.label}
							accessibilityState={{ disabled: !!a.disabledReason }}
							hitSlop={4}
							style={({ pressed }) => [
								styles.ghost,
								a.disabledReason ? styles.disabled : null,
								pressed && styles.pressed,
							]}
						>
							<a.icon size={16} color={t.ink} strokeWidth={2} />
							<Text style={[styles.secondaryText, { color: t.ink }]} numberOfLines={1}>
								{a.label}
							</Text>
						</Pressable>
					))}
			<AssistantButton onPress={onAssistant} />
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 6,
	},
	rowInline: {
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	grow: {
		flex: 1,
		justifyContent: "flex-start",
	},
	ghost: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minWidth: 40,
		height: 40,
		paddingHorizontal: 10,
		borderRadius: 20,
		flexShrink: 1,
	},
	askText: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 15,
	},
	primary: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		height: 36,
		borderRadius: 18,
		paddingHorizontal: 14,
	},
	primaryText: {
		fontFamily: fontFamily.semibold,
		fontSize: 14,
		color: "#ffffff",
		flexShrink: 1,
	},
	secondaryText: {
		fontFamily: fontFamily.medium,
		fontSize: 13,
		flexShrink: 1,
	},
	disabled: {
		opacity: 0.45,
	},
	pressed: {
		opacity: 0.6,
	},
});

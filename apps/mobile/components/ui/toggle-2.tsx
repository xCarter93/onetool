import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { fontFamily, shadow, type, useTokens } from "@/lib/theme";

interface Toggle2Props<T extends string> {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
}

export function Toggle2<T extends string>({
	value,
	options,
	onChange,
}: Toggle2Props<T>) {
	const t = useTokens();
	return (
		<View style={[styles.container, { backgroundColor: t.secondary }]}>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<Pressable
						key={option.value}
						onPress={() => onChange(option.value)}
						accessibilityRole="button"
						accessibilityState={{ selected: active }}
						style={[
							styles.segment,
							active && {
								backgroundColor: t.card,
								boxShadow: shadow.segmented,
							},
						]}
					>
						<Text
							style={[
								styles.label,
								{
									color: active ? t.ink : t.sub,
									fontFamily: active
										? fontFamily.semibold
										: fontFamily.medium,
								},
							]}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		borderRadius: 9,
		padding: 3,
	},
	segment: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		minHeight: 44,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 7,
	},
	label: {
		fontSize: type.sm,
	},
});

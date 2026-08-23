import React, { useState, useEffect, useRef } from "react";
import {
	View,
	Text,
	TextInput,
	Pressable,
	StyleSheet,
	ActivityIndicator,
	KeyboardTypeOptions,
} from "react-native";
import { Check, Pencil, X } from "lucide-react-native";
import { fontFamily, radii, spacing, touch, type, useTokens } from "@/lib/theme";

interface EditableFieldProps {
	label: string;
	value: string | undefined;
	onSave: (value: string) => Promise<void>;
	placeholder?: string;
	multiline?: boolean;
	numberOfLines?: number;
	keyboardType?: KeyboardTypeOptions;
	maxLength?: number;
	editable?: boolean;
	renderValue?: (value: string | undefined) => React.ReactNode;
}

export function EditableField({
	label,
	value,
	onSave,
	placeholder = "Not set",
	multiline = false,
	numberOfLines = 1,
	keyboardType = "default",
	maxLength,
	editable = true,
	renderValue,
}: EditableFieldProps) {
	const t = useTokens();
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value || "");
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<TextInput>(null);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isEditing]);

	// editValue is seeded from `value` on every edit-entry (handleEdit) and cancel,
	// so no effect is needed to mirror the prop — it is only read while editing.

	const handleEdit = () => {
		setEditValue(value || "");
		setIsEditing(true);
	};

	const handleCancel = () => {
		setEditValue(value || "");
		setIsEditing(false);
	};

	const handleSave = async () => {
		if (editValue === value) {
			setIsEditing(false);
			return;
		}

		setIsSaving(true);
		try {
			await onSave(editValue);
			setIsEditing(false);
		} catch (error) {
			console.error("Failed to save:", error);
			// Keep editing mode open on error
		} finally {
			setIsSaving(false);
		}
	};

	if (isEditing) {
		return (
			<View style={styles.container}>
				{label ? (
					<Text style={[styles.label, { color: t.sub }]}>{label}</Text>
				) : null}
				<View style={styles.editRow}>
					<TextInput
						ref={inputRef}
						style={[
							styles.input,
							{
								// Solid ring (not translucent frostedBorder) — needs to read as a
								// focus indicator on its own, no adjacent icon/label backing it up.
								borderColor: t.ring,
								color: t.ink,
								backgroundColor: t.card,
							},
							multiline && {
								height: numberOfLines * 24,
								textAlignVertical: "top",
							},
						]}
						value={editValue}
						onChangeText={setEditValue}
						placeholder={placeholder}
						placeholderTextColor={t.faint}
						multiline={multiline}
						numberOfLines={numberOfLines}
						keyboardType={keyboardType}
						maxLength={maxLength}
						editable={!isSaving}
					/>
					<View style={styles.actions}>
						{isSaving ? (
							<ActivityIndicator size="small" color={t.frostedInk} />
						) : (
							<>
								<Pressable
									onPress={handleSave}
									accessibilityRole="button"
									accessibilityLabel="Save changes"
									style={({ pressed }) => [
										styles.actionButton,
										{ borderColor: t.frostedBorder, backgroundColor: t.frostedBg },
										pressed && styles.actionPressed,
									]}
								>
									<Check size={16} color={t.frostedInk} />
								</Pressable>
								<Pressable
									onPress={handleCancel}
									accessibilityRole="button"
									accessibilityLabel="Discard changes"
									style={({ pressed }) => [
										styles.actionButton,
										{ borderColor: t.border, backgroundColor: t.surface },
										pressed && styles.actionPressed,
									]}
								>
									<X size={16} color={t.danger} />
								</Pressable>
							</>
						)}
					</View>
				</View>
			</View>
		);
	}

	// Read-only: calm labelled text, no well and no pencil — the affordance only
	// means something if it is absent where nothing can be edited.
	if (!editable) {
		return (
			<View style={styles.container}>
				{label ? (
					<Text style={[styles.readLabel, { color: t.faint }]}>{label}</Text>
				) : null}
				{renderValue ? (
					renderValue(value)
				) : (
					<Text
						style={[
							styles.value,
							{ color: t.ink },
							!value && [styles.placeholder, { color: t.faint }],
						]}
					>
						{value || placeholder}
					</Text>
				)}
			</View>
		);
	}

	// Editable: a filled "well" with a trailing pencil. The bare underline it
	// replaces was indistinguishable from static text at arm's length.
	return (
		<View style={styles.container}>
			<Pressable
				onPress={handleEdit}
				accessibilityRole="button"
				accessibilityLabel={`Edit ${label || "field"}`}
				// The label overrides child Text for VoiceOver, so the current
				// content has to be announced as the value.
				accessibilityValue={{ text: value || placeholder }}
				style={({ pressed }) => [
					styles.well,
					{ backgroundColor: t.card, borderColor: t.lineSoft },
					pressed && styles.actionPressed,
				]}
			>
				<View style={styles.wellBody}>
					{label ? (
						<Text style={[styles.wellLabel, { color: t.sub }]}>{label}</Text>
					) : null}
					{renderValue ? (
						renderValue(value)
					) : (
						<Text
							style={[
								styles.value,
								{ color: t.ink },
								!value && [styles.placeholder, { color: t.faint }],
							]}
						>
							{value || placeholder}
						</Text>
					)}
				</View>
				<Pencil size={14} color={t.faint} />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	label: {
		fontSize: type.sm,
		fontFamily: fontFamily.semibold,
		marginBottom: spacing.xs,
	},
	// Read-only twin of the well's label — quieter, and with no fill behind it.
	readLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.eyebrow,
		marginBottom: 3,
	},
	well: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: touch.min,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 9,
	},
	wellBody: { flex: 1, minWidth: 0, gap: 2 },
	wellLabel: {
		fontFamily: fontFamily.medium,
		fontSize: type.eyebrow,
	},
	value: {
		fontSize: type.rowTitle,
		fontFamily: fontFamily.regular,
	},
	placeholder: {
		fontStyle: "italic",
	},
	editRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderRadius: radii.ctrl,
		paddingHorizontal: 12,
		paddingVertical: 10,
		minHeight: touch.min,
		fontSize: type.rowTitle,
		fontFamily: fontFamily.regular,
		letterSpacing: 0, // RN#42589: pin kern so iOS placeholder can't randomly letter-space
	},
	actions: {
		flexDirection: "row",
		gap: 6,
	},
	actionButton: {
		width: touch.min,
		height: touch.min,
		borderRadius: radii.ctrl,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	actionPressed: {
		opacity: 0.7,
	},
});

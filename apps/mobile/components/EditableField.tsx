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
import { Pencil, Check, X } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";

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
				<Text style={[styles.label, { color: t.sub }]}>{label}</Text>
				<View style={styles.editRow}>
					<TextInput
						ref={inputRef}
						style={[
							styles.input,
							{
								borderColor: t.accent,
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
							<ActivityIndicator size="small" color={t.accent} />
						) : (
							<>
								<Pressable
									onPress={handleSave}
									accessibilityRole="button"
									accessibilityLabel="Save changes"
									style={({ pressed }) => [
										styles.actionButton,
										{ borderColor: t.accent, backgroundColor: t.accentSoft },
										pressed && styles.actionPressed,
									]}
								>
									<Check size={16} color={t.accent} />
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

	return (
		<View style={styles.container}>
			<View style={styles.labelRow}>
				<Text style={[styles.label, { color: t.sub }]}>{label}</Text>
				{editable && (
					<Pressable
						onPress={handleEdit}
						accessibilityRole="button"
						accessibilityLabel={`Edit ${label}`}
						style={({ pressed }) => [
							styles.editButton,
							pressed && styles.actionPressed,
						]}
					>
						<Pencil size={14} color={t.faint} />
					</Pressable>
				)}
			</View>
			<View style={styles.valueContainer}>
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
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
	},
	labelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	label: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
	},
	editButton: {
		padding: 4,
	},
	valueContainer: {
		minHeight: 24,
	},
	value: {
		fontSize: 14,
		fontFamily: fontFamily.regular,
	},
	placeholder: {
		fontStyle: "italic",
	},
	editRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 8,
	},
	input: {
		flex: 1,
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		fontFamily: fontFamily.regular,
	},
	actions: {
		flexDirection: "row",
		gap: 6,
	},
	actionButton: {
		width: 36,
		height: 36,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	actionPressed: {
		opacity: 0.7,
	},
});

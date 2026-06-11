import { useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eyebrow } from "@/components/ui";
import { StyledButton } from "@/components/styled";
import { fontFamily, spacing, tokens, type } from "@/lib/theme";
import {
	validateStep1,
	validateStep2,
	validateStep3,
} from "@/lib/wizardValidation";

type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
	1: "Name your organization",
	2: "Business details",
	3: "How big is your team?",
};

export default function CreateOrganizationScreen() {
	const insets = useSafeAreaInsets();
	const [step, setStep] = useState<Step>(1);

	// Step-1 field (wired here so the shell's validateStep1 gate is real).
	const [orgName, setOrgName] = useState("");
	// Per-step inline required-field errors keyed by step.
	const [fieldErrors, setFieldErrors] = useState<string[]>([]);

	function handleAdvance() {
		const result =
			step === 1
				? validateStep1({ orgName })
				: step === 2
					? validateStep2({
							streetAddress: "",
							city: "",
							state: "",
							zipCode: "",
							email: "",
							phone: "",
						})
					: validateStep3({ companySize: undefined });

		if (!result.valid) {
			setFieldErrors(result.fields);
			return;
		}
		setFieldErrors([]);
		if (step < 3) setStep((s) => (s + 1) as Step);
	}

	function handleBack() {
		setFieldErrors([]);
		if (step > 1) setStep((s) => (s - 1) as Step);
	}

	return (
		<View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
			>
				{/* Wizard entry header */}
				<Text style={styles.entryTitle}>Let&apos;s set up your business</Text>
				<Text style={styles.entrySubtitle}>
					A few quick details and you&apos;re in.
				</Text>

				{/* Progress indicator — 3 segments */}
				<View style={styles.progressRow}>
					{([1, 2, 3] as Step[]).map((seg) => (
						<View
							key={seg}
							style={[
								styles.progressSegment,
								{
									backgroundColor:
										seg <= step ? tokens.accent : tokens.border,
								},
							]}
						/>
					))}
				</View>
				<View style={styles.eyebrowRow}>
					<Eyebrow color={tokens.ink}>{`Step ${step} of 3`}</Eyebrow>
				</View>

				{/* Per-step title */}
				<Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>

				{/* Step bodies — filled in Task 2 */}
				{step === 1 ? (
					<View style={styles.stepBody}>
						<Text style={styles.placeholder}>Step 1 body</Text>
					</View>
				) : null}
				{step === 2 ? (
					<View style={styles.stepBody}>
						<Text style={styles.placeholder}>Step 2 body</Text>
					</View>
				) : null}
				{step === 3 ? (
					<View style={styles.stepBody}>
						<Text style={styles.placeholder}>Step 3 body</Text>
					</View>
				) : null}

				{fieldErrors.length > 0 ? (
					<Text style={styles.errorText}>This field is required.</Text>
				) : null}
			</ScrollView>

			{/* Footer nav */}
			<View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
				{step > 1 ? (
					<View style={styles.footerHalf}>
						<StyledButton
							intent="outline"
							label="Back"
							showArrow={false}
							onPress={handleBack}
						/>
					</View>
				) : null}
				<View style={styles.footerHalf}>
					<StyledButton
						intent="primary"
						label={step === 3 ? "Create organization" : "Continue"}
						showArrow={false}
						onPress={handleAdvance}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: tokens.bg,
		paddingHorizontal: spacing.lg,
	},
	scroll: {
		paddingBottom: spacing.xl,
	},
	entryTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
	},
	entrySubtitle: {
		fontFamily: fontFamily.regular,
		fontSize: type.h4,
		color: tokens.sub,
		marginTop: spacing.xs,
	},
	progressRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.xl,
	},
	progressSegment: {
		flex: 1,
		height: 6,
		borderRadius: 3,
	},
	eyebrowRow: {
		marginTop: spacing.sm,
	},
	stepTitle: {
		fontFamily: fontFamily.bold,
		fontSize: type.h1,
		color: tokens.ink,
		marginTop: spacing.xl,
	},
	stepBody: {
		marginTop: spacing.md,
		gap: spacing.md,
	},
	placeholder: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.faint,
	},
	errorText: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		color: tokens.danger,
		marginTop: spacing.sm,
	},
	footer: {
		flexDirection: "row",
		gap: spacing.md,
		paddingTop: spacing.md,
	},
	footerHalf: {
		flex: 1,
	},
});

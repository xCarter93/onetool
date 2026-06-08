import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	CheckCircle2,
	ChevronDown,
	Circle,
	Users,
	FolderKanban,
	FileText,
	FileSignature,
	Receipt,
	CreditCard,
	DollarSign,
	Building2,
} from "lucide-react-native";
import { colors, fontFamily, spacing, radius } from "@/lib/theme";

interface JourneyStep {
	id: number;
	title: string;
	shortTitle: string;
	icon: React.ComponentType<any>;
	completionKey: string;
	color: string;
}

const journeySteps: JourneyStep[] = [
	{
		id: 1,
		title: "Create Organization",
		shortTitle: "Org Setup",
		icon: Building2,
		completionKey: "hasOrganization",
		color: colors.primary,
	},
	{
		id: 2,
		title: "First Client",
		shortTitle: "Add Client",
		icon: Users,
		completionKey: "hasClient",
		color: colors.primary,
	},
	{
		id: 3,
		title: "First Project",
		shortTitle: "Add Project",
		icon: FolderKanban,
		completionKey: "hasProject",
		color: colors.primary,
	},
	{
		id: 4,
		title: "First Quote",
		shortTitle: "Create Quote",
		icon: FileText,
		completionKey: "hasQuote",
		color: colors.primary,
	},
	{
		id: 5,
		title: "E-Signature",
		shortTitle: "E-Sign Doc",
		icon: FileSignature,
		completionKey: "hasESignature",
		color: colors.primary,
	},
	{
		id: 6,
		title: "First Invoice",
		shortTitle: "Send Invoice",
		icon: Receipt,
		completionKey: "hasInvoice",
		color: colors.primary,
	},
	{
		id: 7,
		title: "Stripe Connect",
		shortTitle: "Setup Stripe",
		icon: CreditCard,
		completionKey: "hasStripeConnect",
		color: colors.primary,
	},
	{
		id: 8,
		title: "First Payment",
		shortTitle: "Get Paid",
		icon: DollarSign,
		completionKey: "hasPayment",
		color: colors.primary,
	},
];

export function JourneyProgress() {
	const journeyProgress = useQuery(api.homeStats.getJourneyProgress);
	// Collapsed by default — the step strip is reference info, not daily-use.
	const [expanded, setExpanded] = useState(false);

	if (!journeyProgress) {
		return (
			<View style={styles.container}>
				<View style={styles.header}>
					<View style={styles.headerContent}>
						<View style={styles.skeletonTitle} />
						<View style={styles.skeletonSubtitle} />
					</View>
				</View>
			</View>
		);
	}

	const completedCount = journeySteps.filter(
		(step) =>
			journeyProgress[step.completionKey as keyof typeof journeyProgress],
	).length;

	return (
		<View style={styles.container}>
			<Pressable
				style={styles.header}
				onPress={() => setExpanded((v) => !v)}
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				accessibilityLabel={`Your Journey, ${completedCount} of ${journeySteps.length} completed`}
			>
				<View style={styles.headerContent}>
					<Text style={styles.title}>Your Journey</Text>
					<Text style={styles.subtitle}>
						{completedCount} of {journeySteps.length} completed
					</Text>
				</View>
				<View style={styles.badge}>
					<Text style={styles.badgeText}>
						{Math.round((completedCount / journeySteps.length) * 100)}%
					</Text>
				</View>
				<ChevronDown
					size={20}
					color={colors.mutedForeground}
					style={[styles.chevron, expanded && styles.chevronExpanded]}
				/>
			</Pressable>

			{expanded && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.scrollContent}
					style={styles.scrollView}
				>
					{journeySteps.map((step, index) => {
						const isCompleted =
							journeyProgress[
								step.completionKey as keyof typeof journeyProgress
							];
						const IconComponent = step.icon;

						return (
							<View
								key={step.id}
								style={[
									styles.stepCard,
									isCompleted && styles.stepCardCompleted,
								]}
							>
								<View
									style={[
										styles.stepIconContainer,
										{
											backgroundColor: isCompleted
												? "rgba(0, 166, 244, 0.15)"
												: "rgba(0, 166, 244, 0.1)",
										},
									]}
								>
									<IconComponent
										size={20}
										color={isCompleted ? step.color : colors.mutedForeground}
									/>
								</View>

								<View style={styles.stepContent}>
									<Text
										style={[
											styles.stepTitle,
											isCompleted && styles.stepTitleCompleted,
										]}
										numberOfLines={1}
									>
										{step.shortTitle}
									</Text>
									<Text style={styles.stepNumber}>Step {step.id}</Text>
								</View>

								<View style={styles.statusIcon}>
									{isCompleted ? (
										<CheckCircle2 size={18} color="#10b981" />
									) : (
										<Circle size={18} color={colors.border} />
									)}
								</View>
							</View>
						);
					})}
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
	},
	headerContent: {
		flex: 1,
	},
	title: {
		fontSize: 18,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: 2,
	},
	subtitle: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	badge: {
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.sm,
		paddingVertical: 4,
		borderRadius: radius.full,
		minWidth: 48,
		alignItems: "center",
	},
	badgeText: {
		fontSize: 13,
		fontFamily: fontFamily.bold,
		color: "#fff",
	},
	chevron: {
		marginLeft: spacing.sm,
	},
	chevronExpanded: {
		transform: [{ rotate: "180deg" }],
	},
	scrollView: {
		marginHorizontal: -spacing.md,
		marginTop: spacing.md,
	},
	scrollContent: {
		paddingHorizontal: spacing.md,
		gap: spacing.sm,
	},
	stepCard: {
		width: 140,
		backgroundColor: colors.card,
		borderRadius: radius.lg,
		padding: spacing.sm,
		borderWidth: 1,
		borderColor: colors.border,
		flexDirection: "column",
		gap: spacing.xs,
	},
	stepCardCompleted: {
		borderColor: "#10b98150",
		backgroundColor: `${colors.card}`,
	},
	stepCardPressed: {
		opacity: 0.7,
	},
	stepIconContainer: {
		width: 40,
		height: 40,
		borderRadius: radius.md,
		alignItems: "center",
		justifyContent: "center",
	},
	stepContent: {
		flex: 1,
	},
	stepTitle: {
		fontSize: 14,
		fontFamily: fontFamily.semibold,
		color: colors.foreground,
		marginBottom: 2,
	},
	stepTitleCompleted: {
		color: colors.foreground,
	},
	stepNumber: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
		color: colors.mutedForeground,
	},
	statusIcon: {
		alignSelf: "flex-end",
	},
	skeletonTitle: {
		width: 120,
		height: 18,
		backgroundColor: colors.muted,
		borderRadius: radius.sm,
		marginBottom: 6,
	},
	skeletonSubtitle: {
		width: 100,
		height: 13,
		backgroundColor: colors.muted,
		borderRadius: radius.sm,
	},
});

import {
	View,
	Text,
	StyleSheet,
	Pressable,
	Linking,
	ActivityIndicator,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Card } from "@/components/ui";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { FileText, Download } from "lucide-react-native";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

interface ProjectDocumentsProps {
	projectId: Id<"projects">;
}

type ProjectDocument = {
	_id: Id<"projectDocuments">;
	name: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	uploadedAt: number;
	downloadUrl: string | null;
};

const formatFileSize = (bytes: number): string => {
	if (bytes <= 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	let i = Math.floor(Math.log(bytes) / Math.log(k));
	i = Math.min(i, sizes.length - 1);
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const formatDate = (timestamp: number): string =>
	new Date(timestamp).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

export function ProjectDocuments({ projectId }: ProjectDocumentsProps) {
	const t = useTokens();
	const docsResult = useQuery(
		api.projectDocuments.listByProject,
		projectId ? { projectId } : "skip"
	);
	const loading = docsResult === undefined;
	const docs = docsResult ?? [];

	const handleDocumentPress = async (doc: ProjectDocument) => {
		// downloadUrl can be null when the storage ref is missing — never call
		// Linking.openURL(null).
		if (!doc.downloadUrl) return;
		try {
			const canOpen = await Linking.canOpenURL(doc.downloadUrl);
			if (canOpen) await Linking.openURL(doc.downloadUrl);
		} catch (error) {
			console.error("Failed to open document:", error);
		}
	};

	if (loading) {
		return (
			<Card style={styles.card}>
				<Text style={[styles.cardTitle, { color: t.ink }]}>
					Project Documents
				</Text>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="small" color={t.accent} />
					<Text style={[styles.loadingText, { color: t.mutedForeground }]}>
						Loading documents...
					</Text>
				</View>
			</Card>
		);
	}

	if (docs.length === 0) {
		return (
			<Card style={styles.card}>
				<Text style={[styles.cardTitle, { color: t.ink }]}>
					Project Documents
				</Text>
				<View style={styles.emptyContainer}>
					<View style={[styles.emptyIcon, { backgroundColor: t.muted }]}>
						<FileText size={28} color={t.mutedForeground} />
					</View>
					<Text style={[styles.emptyTitle, { color: t.ink }]}>
						No documents yet
					</Text>
				</View>
			</Card>
		);
	}

	return (
		<Card style={styles.card}>
			<Text style={[styles.cardTitle, { color: t.ink }]}>
				Project Documents ({docs.length})
			</Text>
			<View style={styles.documentsList}>
				{docs.map((doc) => {
					const openable = !!doc.downloadUrl;
					return (
						<Pressable
							key={doc._id}
							style={({ pressed }) => [
								styles.documentItem,
								{ backgroundColor: t.surface, borderColor: t.line },
								pressed && openable && styles.documentItemPressed,
							]}
							onPress={() => handleDocumentPress(doc)}
							disabled={!openable}
						>
							<View style={[styles.documentIcon, { backgroundColor: t.card }]}>
								<FileText size={20} color={t.mutedForeground} />
							</View>

							<View style={styles.documentInfo}>
								<Text
									style={[styles.documentName, { color: t.ink }]}
									numberOfLines={2}
								>
									{doc.name || doc.fileName}
								</Text>
								<View style={styles.documentMeta}>
									{doc.fileSize > 0 && (
										<>
											<Text
												style={[
													styles.documentMetaText,
													{ color: t.mutedForeground },
												]}
											>
												{formatFileSize(doc.fileSize)}
											</Text>
											<Text
												style={[
													styles.documentMetaSeparator,
													{ color: t.mutedForeground },
												]}
											>
												•
											</Text>
										</>
									)}
									<Text
										style={[
											styles.documentMetaText,
											{ color: t.mutedForeground },
										]}
									>
										{formatDate(doc.uploadedAt)}
									</Text>
								</View>
							</View>

							<View style={styles.downloadIndicator}>
								{openable ? (
									<Download size={16} color={t.accent} />
								) : (
									<Text
										style={[
											styles.unavailableText,
											{ color: t.mutedForeground },
										]}
									>
										Unavailable
									</Text>
								)}
							</View>
						</Pressable>
					);
				})}
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		marginTop: 16,
	},
	cardTitle: {
		fontSize: 16,
		fontFamily: fontFamily.semibold,
	},
	loadingContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 24,
	},
	loadingText: {
		fontSize: 13,
		fontFamily: fontFamily.regular,
	},
	emptyContainer: {
		alignItems: "center",
		paddingVertical: 28,
	},
	emptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 12,
	},
	emptyTitle: {
		fontSize: 15,
		fontFamily: fontFamily.semibold,
		marginBottom: 12,
	},
	documentsList: {
		gap: 8,
		marginTop: 12,
	},
	documentItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 8,
		borderRadius: radii.rSm,
		borderWidth: 1,
	},
	documentItemPressed: {
		opacity: 0.7,
	},
	documentIcon: {
		width: 40,
		height: 40,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	documentInfo: {
		flex: 1,
		minWidth: 0,
	},
	documentName: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
		marginBottom: 2,
	},
	documentMeta: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	documentMetaText: {
		fontSize: 11,
		fontFamily: fontFamily.regular,
	},
	documentMetaSeparator: {
		fontSize: 11,
		marginHorizontal: 4,
	},
	downloadIndicator: {
		minWidth: 24,
		height: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	unavailableText: {
		fontSize: 10,
		fontFamily: fontFamily.medium,
	},
});

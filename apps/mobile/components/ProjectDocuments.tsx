import {
	View,
	Text,
	StyleSheet,
	Pressable,
	Linking,
	ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Card, Button } from "@/components/ui";
import { fontFamily, radii, useTokens } from "@/lib/theme";
import { FileText, Download, Upload } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Generic fallback MIME the picker emits when it cannot identify a type. It is
// NOT in the server's allowed list, so we never forward it to create() —
// resolve from the file extension instead (unknown extensions abort upload).
const GENERIC_MIME = "application/" + "octet-stream";

// extension -> MIME, drawn from ALLOWED_MESSAGE_ATTACHMENT_TYPES (lib/storage.ts).
const EXTENSION_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	pdf: "application/pdf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	txt: "text/plain",
	csv: "text/csv",
	zip: "application/zip",
};

const mimeFromExtension = (fileName: string): string | null => {
	const ext = fileName.split(".").pop()?.toLowerCase();
	if (!ext) return null;
	return EXTENSION_MIME[ext] ?? null;
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
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);

	const docsResult = useQuery(
		api.projectDocuments.listByProject,
		projectId ? { projectId } : "skip"
	);
	const loading = docsResult === undefined;
	const docs = docsResult ?? [];

	const generateUploadUrl = useMutation(api.projectDocuments.generateUploadUrl);
	const createDoc = useMutation(api.projectDocuments.create);

	const handleUpload = async () => {
		setUploadError(null);
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: "*/*",
				copyToCacheDirectory: true,
			});
			if (result.canceled) return;
			const asset = result.assets[0];
			if (!asset) return;

			setUploading(true);

			// Build the blob first so its size is known when the picker omits one.
			const blob = await (await fetch(asset.uri)).blob();

			// Server rejects fileSize <= 0 — derive from blob.size when missing.
			const fileSize = asset.size && asset.size > 0 ? asset.size : blob.size;
			if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
				setUploadError("Upload failed. Try again.");
				return;
			}

			// Generic fallback is not server-allowed — resolve from extension.
			const resolvedMime =
				asset.mimeType && asset.mimeType !== GENERIC_MIME
					? asset.mimeType
					: mimeFromExtension(asset.name);
			if (!resolvedMime) {
				setUploadError("Upload failed. Try again.");
				return;
			}

			const uploadUrl = await generateUploadUrl();
			const up = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": resolvedMime },
				body: blob,
			});
			if (!up.ok) throw new Error("Upload failed");
			const { storageId } = (await up.json()) as {
				storageId: Id<"_storage">;
			};

			await createDoc({
				projectId,
				name: asset.name,
				fileName: asset.name,
				fileSize,
				mimeType: resolvedMime,
				storageId,
			});
			// listByProject is reactive — it auto-refreshes after create.
		} catch (error) {
			console.error("Document upload error:", error);
			setUploadError("Upload failed. Try again.");
		} finally {
			setUploading(false);
		}
	};

	const uploadButton = (
		<View style={styles.uploadRow}>
			{uploading ? (
				<View style={styles.uploadingRow}>
					<ActivityIndicator size="small" color={t.accent} />
					<Text style={[styles.uploadingText, { color: t.mutedForeground }]}>
						Uploading…
					</Text>
				</View>
			) : (
				<Button
					title="Upload document"
					variant="secondary"
					icon={<Upload size={16} color={t.ink} />}
					onPress={handleUpload}
				/>
			)}
			{uploadError ? (
				<Text style={[styles.errorText, { color: t.danger }]}>
					{uploadError}
				</Text>
			) : null}
		</View>
	);

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
					{uploadButton}
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
			{uploadButton}
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
	uploadRow: {
		marginTop: 12,
		gap: 8,
		alignItems: "center",
	},
	uploadingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 12,
	},
	uploadingText: {
		fontSize: 13,
		fontFamily: fontFamily.medium,
	},
	errorText: {
		fontSize: 12,
		fontFamily: fontFamily.medium,
	},
});

import { ActionSheetIOS, Alert, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { resolveMime } from "./mime";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

// A picked file normalized across the photo library, camera, and Files. size
// may be 0 when the source omits it — callers derive it from disk before upload.
export interface PickedFile {
	uri: string;
	name: string;
	mimeType: string;
	size: number;
}

type Source = "library" | "camera" | "files";

// Native chooser: action sheet on iOS, alert on Android. Resolves null when
// the user dismisses without choosing a source.
function chooseSource(): Promise<Source | null> {
	return new Promise((resolve) => {
		if (Platform.OS === "ios") {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: ["Photo Library", "Take Photo", "Choose File", "Cancel"],
					cancelButtonIndex: 3,
				},
				(i) =>
					resolve(
						i === 0 ? "library" : i === 1 ? "camera" : i === 2 ? "files" : null
					)
			);
		} else {
			Alert.alert(
				"Upload",
				undefined,
				[
					{ text: "Photo Library", onPress: () => resolve("library") },
					{ text: "Take Photo", onPress: () => resolve("camera") },
					{ text: "Choose File", onPress: () => resolve("files") },
				],
				{ cancelable: true, onDismiss: () => resolve(null) }
			);
		}
	});
}

// The picker reports a server-allowed name+MIME; camera shots arrive without a
// filename, so synthesize one with an extension resolveMime can read.
function normalizeImage(asset: ImagePicker.ImagePickerAsset): PickedFile | null {
	let name = asset.fileName ?? "";
	if (!name) {
		const ext = asset.mimeType?.split("/")[1] ?? "jpg";
		name = `photo_${asset.assetId ?? asset.uri.split("/").pop() ?? "image"}.${ext}`;
	}
	const mimeType = resolveMime(asset.mimeType, name);
	if (!mimeType) return null;
	return { uri: asset.uri, name, mimeType, size: asset.fileSize ?? 0 };
}

async function pickImages(
	source: "library" | "camera",
	multiple: boolean
): Promise<PickedFile[]> {
	const perm =
		source === "camera"
			? await ImagePicker.requestCameraPermissionsAsync()
			: await ImagePicker.requestMediaLibraryPermissionsAsync();
	if (!perm.granted) {
		Alert.alert(
			source === "camera" ? "Camera access needed" : "Photo access needed",
			"Enable access in Settings to upload from here."
		);
		return [];
	}

	const result =
		source === "camera"
			? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
			: await ImagePicker.launchImageLibraryAsync({
					mediaTypes: ["images"],
					allowsMultipleSelection: multiple,
					quality: 0.8,
				});
	if (result.canceled) return [];

	const picked = result.assets
		.map(normalizeImage)
		.filter((f): f is PickedFile => f !== null);
	if (picked.length < result.assets.length) {
		Alert.alert("Unsupported image", "Some items use an unsupported format.");
	}
	return picked;
}

async function pickFiles(multiple: boolean): Promise<PickedFile[]> {
	const result = await DocumentPicker.getDocumentAsync({
		type: "*/*",
		copyToCacheDirectory: true,
		multiple,
	});
	if (result.canceled) return [];

	const picked: PickedFile[] = [];
	for (const asset of result.assets) {
		const mimeType = resolveMime(asset.mimeType, asset.name);
		if (!mimeType) {
			Alert.alert("Unsupported file", `${asset.name} is not a supported type`);
			continue;
		}
		picked.push({
			uri: asset.uri,
			name: asset.name,
			mimeType,
			size: asset.size ?? 0,
		});
	}
	return picked;
}

// Prompt for a source, then pick. Returns [] on cancel. Camera is always single;
// library and Files honor `multiple`.
export async function pickUpload(opts?: {
	multiple?: boolean;
}): Promise<PickedFile[]> {
	const multiple = opts?.multiple ?? false;
	const source = await chooseSource();
	if (!source) return [];
	if (source === "files") return pickFiles(multiple);
	return pickImages(source, multiple);
}

// Stream the file URI natively to a Convex signed upload URL. RN's bridgeless
// fetch() can't read a local file:// blob, so a Blob body uploads empty / throws.
export async function uploadToConvex(
	uploadUrl: string,
	file: { uri: string; mimeType: string }
): Promise<Id<"_storage">> {
	const result = await FileSystem.uploadAsync(uploadUrl, file.uri, {
		httpMethod: "POST",
		uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
		headers: { "Content-Type": file.mimeType },
	});
	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Upload failed (HTTP ${result.status})`);
	}
	const { storageId } = JSON.parse(result.body) as { storageId: Id<"_storage"> };
	return storageId;
}

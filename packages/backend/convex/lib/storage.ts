import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Shared storage utilities for handling file uploads, downloads, and management
 * Used by both documents and messageAttachments
 */

/**
 * File metadata interface
 */
export interface FileMetadata {
	fileName: string;
	fileSize: number;
	mimeType: string;
}

/**
 * Storage configuration
 */
export const StorageConfig = {
	// Max file size in bytes (10MB default)
	MAX_FILE_SIZE: 10 * 1024 * 1024,

	// Allowed MIME types for message attachments
	ALLOWED_MESSAGE_ATTACHMENT_TYPES: [
		// Images
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/svg+xml",
		// iPhone camera default format
		"image/heic",
		"image/heif",
		// Documents
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
		"text/plain",
		"text/csv",
		// Archives
		"application/zip",
		"application/x-zip-compressed",
	],

	// Allowed MIME types for document PDFs
	ALLOWED_DOCUMENT_TYPES: ["application/pdf"],
} as const;

/**
 * Storage helper functions
 */
export class StorageHelpers {
	/**
	 * Validate file metadata
	 */
	static validateFileMetadata(
		metadata: FileMetadata,
		allowedTypes?: readonly string[],
		maxSize?: number
	): { valid: boolean; error?: string } {
		const types =
			allowedTypes || StorageConfig.ALLOWED_MESSAGE_ATTACHMENT_TYPES;
		const size = maxSize || StorageConfig.MAX_FILE_SIZE;

		// Check file size
		if (metadata.fileSize <= 0) {
			return { valid: false, error: "File size must be greater than 0" };
		}

		if (metadata.fileSize > size) {
			const sizeMB = Math.round(size / (1024 * 1024));
			return {
				valid: false,
				error: `File size exceeds maximum allowed size of ${sizeMB}MB`,
			};
		}

		// Check MIME type (case-insensitive)
		const allowedLower = types.map((t) => t.toLowerCase());
		if (!allowedLower.includes(metadata.mimeType.toLowerCase())) {
			return {
				valid: false,
				error: `File type ${metadata.mimeType} is not allowed`,
			};
		}

		// Check filename
		if (!metadata.fileName || metadata.fileName.trim().length === 0) {
			return { valid: false, error: "File name is required" };
		}

		return { valid: true };
	}

	/**
	 * Format file size for display (bytes to human readable)
	 */
	static formatFileSize(bytes: number): string {
		if (bytes === 0) return "0 Bytes";

		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
	}

	/**
	 * Get file extension from filename
	 */
	static getFileExtension(fileName: string): string {
		const lastDot = fileName.lastIndexOf(".");
		if (lastDot === -1) return "";
		return fileName.substring(lastDot + 1).toLowerCase();
	}

	/**
	 * Get file type category from MIME type
	 */
	static getFileCategory(
		mimeType: string
	): "image" | "document" | "archive" | "other" {
		if (mimeType.startsWith("image/")) return "image";
		if (mimeType === "application/pdf") return "document";
		if (
			mimeType.includes("word") ||
			mimeType.includes("excel") ||
			mimeType.includes("powerpoint") ||
			mimeType.includes("text")
		)
			return "document";
		if (mimeType.includes("zip")) return "archive";
		return "other";
	}

	/**
	 * Get storage URL from storage ID
	 */
	static async getStorageUrl(
		ctx: QueryCtx | MutationCtx,
		storageId: Id<"_storage">
	): Promise<string | null> {
		try {
			return await ctx.storage.getUrl(storageId);
		} catch (error) {
			console.error("Failed to get storage URL:", error);
			return null;
		}
	}

	/**
	 * Delete a file from storage
	 */
	static async deleteFromStorage(
		ctx: MutationCtx,
		storageId: Id<"_storage">
	): Promise<{ success: boolean; error?: string }> {
		try {
			await ctx.storage.delete(storageId);
			return { success: true };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			console.error("Failed to delete from storage:", errorMessage);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Generate an upload URL for Convex storage
	 */
	static async generateUploadUrl(ctx: MutationCtx): Promise<string> {
		return await ctx.storage.generateUploadUrl();
	}
}

/**
 * File type icon mapping for UI
 */
export const FileTypeIcons = {
	// Images
	"image/jpeg": "📷",
	"image/jpg": "📷",
	"image/png": "🖼️",
	"image/gif": "🎞️",
	"image/webp": "🖼️",
	"image/svg+xml": "🎨",

	// Documents
	"application/pdf": "📄",
	"application/msword": "📝",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"📝",
	"application/vnd.ms-excel": "📊",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
	"application/vnd.ms-powerpoint": "📊",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"📊",
	"text/plain": "📄",
	"text/csv": "📊",

	// Archives
	"application/zip": "📦",
	"application/x-zip-compressed": "📦",

	// Default
	default: "📎",
} as const;

/**
 * Get icon for file type
 */
export function getFileIcon(mimeType: string): string {
	return (
		FileTypeIcons[mimeType as keyof typeof FileTypeIcons] ||
		FileTypeIcons.default
	);
}

// Generic fallback the document picker emits when it can't identify a type.
// Not in the server's allowed list (convex/lib/storage.ts), so callers resolve
// a real type from the extension instead of forwarding it.
export const GENERIC_MIME = "application/" + "octet-stream";

// extension -> MIME, drawn from ALLOWED_MESSAGE_ATTACHMENT_TYPES (convex/lib/storage.ts).
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

// Server-allowed MIME for an upload: trust the picker's type unless it's the
// generic fallback, else derive from the extension. null = unknown/unsupported.
export const resolveMime = (
	mimeType: string | undefined,
	fileName: string
): string | null =>
	mimeType && mimeType !== GENERIC_MIME ? mimeType : mimeFromExtension(fileName);

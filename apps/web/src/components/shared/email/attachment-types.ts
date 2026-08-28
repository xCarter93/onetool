import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export interface ComposerAttachment {
	storageId: Id<"_storage">;
	filename: string;
	mimeType: string;
	size: number;
	source: "generated-pdf" | "upload";
}

/** Mirrors MAX_ATTACHMENT_BYTES in convex/email/attachments.ts. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Executable and script types Resend refuses at send time. Blocked at pick
 * time so the user sees the problem before the upload, not after the send.
 */
export const BLOCKED_ATTACHMENT_EXTENSIONS = [
	"ade",
	"adp",
	"app",
	"asp",
	"bas",
	"bat",
	"cer",
	"chm",
	"cmd",
	"com",
	"cpl",
	"crt",
	"csh",
	"der",
	"dll",
	"exe",
	"fxp",
	"gadget",
	"hlp",
	"hta",
	"inf",
	"ins",
	"isp",
	"its",
	"jar",
	"js",
	"jse",
	"ksh",
	"lib",
	"lnk",
	"mad",
	"maf",
	"mag",
	"mam",
	"maq",
	"mar",
	"mas",
	"mat",
	"mau",
	"mav",
	"maw",
	"mda",
	"mdb",
	"mde",
	"mdt",
	"mdw",
	"mdz",
	"msc",
	"msh",
	"msh1",
	"msh2",
	"mshxml",
	"msi",
	"msp",
	"mst",
	"ops",
	"pcd",
	"pif",
	"plg",
	"prf",
	"prg",
	"ps1",
	"ps1xml",
	"ps2",
	"ps2xml",
	"psc1",
	"psc2",
	"pst",
	"reg",
	"scf",
	"scr",
	"sct",
	"shb",
	"shs",
	"sys",
	"tmp",
	"url",
	"vb",
	"vbe",
	"vbs",
	"vps",
	"vsmacros",
	"vss",
	"vst",
	"vsw",
	"vxd",
	"ws",
	"wsc",
	"wsf",
	"wsh",
	"xnk",
] as const;

export function attachmentExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isBlockedAttachmentFilename(filename: string): boolean {
	const extension = attachmentExtension(filename);
	return (BLOCKED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(
		extension
	);
}

export function totalAttachmentBytes(
	attachments: readonly { size: number }[]
): number {
	return attachments.reduce((total, item) => total + item.size, 0);
}

/** Strips `source`, which is composer-only; Convex rejects unknown fields. */
export function toOutboundAttachments(
	attachments: readonly ComposerAttachment[]
): Omit<ComposerAttachment, "source">[] {
	return attachments.map(({ storageId, filename, mimeType, size }) => ({
		storageId,
		filename,
		mimeType,
		size,
	}));
}

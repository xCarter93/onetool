/**
 * Copy text, reporting whether it landed. The Clipboard API rejects on
 * insecure origins, when the document is not focused, and when permission is
 * denied — so callers must not claim success until this resolves true.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

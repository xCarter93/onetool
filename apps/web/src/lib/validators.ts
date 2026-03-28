/** Regex-based URL validation — avoids new URL() browser inconsistencies. */
export const URL_PATTERN = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;

export function isValidUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed) return true;
	return URL_PATTERN.test(trimmed);
}

/** IANA timezone list; older runtimes without supportedValuesOf fall back to UTC. */
export const TIMEZONES: string[] = (() => {
	try {
		return Intl.supportedValuesOf("timeZone");
	} catch {
		return ["UTC"];
	}
})();

export function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

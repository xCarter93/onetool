import { ConvexError } from "convex/values";

/** Length-leaking but content-safe string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Secrets the Next.js portal routes may present to prove a call came through
 * them and not straight from the portal browser.
 *
 * Falls back to PORTAL_OTP_REQUEST_SECRET so this needs no new environment
 * variable to start working: that secret is already load-bearing for portal
 * sign-in (`/portal/otp/request` fails closed without it), so any deployment
 * where it is missing has no signed-in contacts to attest for in the first
 * place.
 *
 * PORTAL_ATTESTATION_SECRET splits the two purposes. Set it in the Convex env
 * FIRST, then in Vercel. Convex also accepts PORTAL_OTP_REQUEST_SECRET (the last
 * entry below), so while only Convex knows the new secret the web routes keep
 * presenting the OTP secret and signing continues. The failure mode to avoid is
 * the reverse — setting it in Vercel only, where the routes present a secret
 * Convex does not accept and every signature/decline fails closed with
 * UNATTESTED_REQUEST.
 * Rotation: _NEXT lives only here — the web env has no _NEXT slot. Set the new
 * value in PORTAL_ATTESTATION_SECRET_NEXT, set Vercel's PORTAL_ATTESTATION_SECRET
 * to it, then promote it into PORTAL_ATTESTATION_SECRET here and unset _NEXT.
 * Both are accepted meanwhile, so there is no signing outage.
 */
function attestationSecrets(): string[] {
	return [
		process.env.PORTAL_ATTESTATION_SECRET,
		process.env.PORTAL_ATTESTATION_SECRET_NEXT,
		process.env.PORTAL_OTP_REQUEST_SECRET,
	].filter((value): value is string => Boolean(value));
}

/**
 * Reject a portal call whose observed IP/UA the server cannot vouch for.
 *
 * The portal browser holds a genuine Convex token minted by `/api/portal/token`,
 * so every public portal action is directly callable from client JS with
 * arbitrary arguments. Anything the Next.js route derives on the caller's behalf
 * — the real IP, the user agent, the typed-signature intent affirmation — is
 * therefore only trustworthy if the route proves it made the call.
 */
export function requirePortalAttestation(attestation: string | undefined): void {
	const accepted = attestationSecrets();
	if (accepted.length === 0) {
		// Fail closed: an unattestable signature is worse than an unavailable one.
		throw new ConvexError({ code: "PORTAL_MISCONFIGURED" });
	}
	const presented = attestation ?? "";
	// No early exit — compare against every accepted secret so the number of
	// comparisons does not depend on which one matched.
	let matched = false;
	for (const secret of accepted) {
		if (constantTimeEqual(presented, secret)) matched = true;
	}
	if (!matched) {
		throw new ConvexError({ code: "UNATTESTED_REQUEST" });
	}
}

/**
 * Bound an attested IP string. Long enough for IPv6 with a zone id, short
 * enough that the audit column cannot become a storage sink.
 */
export function boundIpAddress(ip: string): string {
	const trimmed = ip.trim();
	if (!trimmed) return "unknown";
	return trimmed.slice(0, 64);
}

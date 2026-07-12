import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

// Clerk role keys round-trip verbatim through the org webhook. The instance uses
// only the two Clerk defaults; gate on Clerk's live membership.role (NOT the
// Convex `role` column, which is written inconsistently).
export const ADMIN_ROLE = "org:admin";
export const MEMBER_ROLE = "org:member";
export const ROLE_OPTIONS = [
	{ value: ADMIN_ROLE, label: "Admin" },
	{ value: MEMBER_ROLE, label: "Member" },
];

// Opt-in fetch params, hoisted so object identity stays stable across renders.
// Split per resource so a component only fetches the collection it renders — the
// read-only roster shouldn't pull invitations.
export const MEMBERSHIPS_PARAMS = {
	memberships: { pageSize: 20 },
};
export const INVITATIONS_PARAMS = {
	invitations: { pageSize: 20 },
};

export function roleLabel(role: string | undefined | null) {
	if (role === ADMIN_ROLE) return "Admin";
	if (role === MEMBER_ROLE) return "Member";
	return role ?? "Member";
}

export function getInitials(name: string, email?: string) {
	const src = name.trim() || (email ?? "").trim();
	const parts = src.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	if (src.length >= 2) return src.slice(0, 2).toUpperCase();
	return src.slice(0, 1).toUpperCase() || "?";
}

export function memberDisplayName(member: {
	publicUserData?:
		| {
				firstName?: string | null;
				lastName?: string | null;
				identifier?: string | null;
		  }
		| null;
}) {
	const info = member.publicUserData;
	const name = `${info?.firstName ?? ""} ${info?.lastName ?? ""}`.trim();
	return name || info?.identifier || "";
}

export function clerkErr(err: unknown, fallback = "Something went wrong.") {
	if (isClerkAPIResponseError(err)) {
		return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? fallback;
	}
	return err instanceof Error ? err.message : fallback;
}

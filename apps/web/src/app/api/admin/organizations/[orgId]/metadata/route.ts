import { clerkClient, auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

async function checkAdminAccess() {
	const { userId } = await auth();
	if (!userId) {
		return { authorized: false, error: "Unauthorized", status: 401 };
	}

	const user = await currentUser();
	const hasAdminAccess =
		(user?.privateMetadata as Record<string, unknown>)
			?.has_admin_dashboard_access === true;

	if (!hasAdminAccess) {
		return { authorized: false, error: "Forbidden", status: 403 };
	}

	return { authorized: true };
}

// [PUB-30] CSRF guard for state-changing admin routes. Fail CLOSED: block
// unless there is an affirmative same-origin signal, since a missing Origin
// AND missing Sec-Fetch-Site would otherwise sail through on a forged request.
function isCrossSite(request: Request): boolean {
	const secFetchSite = request.headers.get("sec-fetch-site");
	if (secFetchSite) {
		return secFetchSite !== "same-origin" && secFetchSite !== "same-site";
	}
	// Older UA without Sec-Fetch-Site: require a matching Origin, else block.
	const origin = request.headers.get("origin");
	if (!origin) return true;
	try {
		return new URL(origin).origin !== new URL(request.url).origin;
	} catch {
		return true;
	}
}

// POST: Set has_premium_feature_access = true
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ orgId: string }> }
) {
	if (isCrossSite(request)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const accessCheck = await checkAdminAccess();
	if (!accessCheck.authorized) {
		return NextResponse.json(
			{ error: accessCheck.error },
			{ status: accessCheck.status }
		);
	}

	const { orgId } = await params;
	const client = await clerkClient();

	try {
		await client.organizations.updateOrganizationMetadata(orgId, {
			publicMetadata: {
				has_premium_feature_access: true,
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating organization metadata:", error);
		return NextResponse.json(
			{ error: "Failed to update organization metadata" },
			{ status: 500 }
		);
	}
}

// DELETE: Remove has_premium_feature_access
export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ orgId: string }> }
) {
	if (isCrossSite(request)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const accessCheck = await checkAdminAccess();
	if (!accessCheck.authorized) {
		return NextResponse.json(
			{ error: accessCheck.error },
			{ status: accessCheck.status }
		);
	}

	const { orgId } = await params;
	const client = await clerkClient();

	try {
		// Set the key to null to remove it (Clerk merges metadata, so we must explicitly nullify)
		await client.organizations.updateOrganizationMetadata(orgId, {
			publicMetadata: {
				has_premium_feature_access: null,
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error removing organization metadata:", error);
		return NextResponse.json(
			{ error: "Failed to remove organization metadata" },
			{ status: 500 }
		);
	}
}

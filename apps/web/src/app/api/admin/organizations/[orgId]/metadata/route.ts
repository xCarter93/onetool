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

// POST: Set has_premium_feature_access = true
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ orgId: string }> }
) {
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
	_request: Request,
	{ params }: { params: Promise<{ orgId: string }> }
) {
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

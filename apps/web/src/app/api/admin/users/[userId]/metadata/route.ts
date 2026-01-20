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
	{ params }: { params: Promise<{ userId: string }> }
) {
	const accessCheck = await checkAdminAccess();
	if (!accessCheck.authorized) {
		return NextResponse.json(
			{ error: accessCheck.error },
			{ status: accessCheck.status }
		);
	}

	const { userId } = await params;
	const client = await clerkClient();

	try {
		await client.users.updateUserMetadata(userId, {
			publicMetadata: {
				has_premium_feature_access: true,
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error updating user metadata:", error);
		return NextResponse.json(
			{ error: "Failed to update user metadata" },
			{ status: 500 }
		);
	}
}

// DELETE: Remove has_premium_feature_access
export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ userId: string }> }
) {
	const accessCheck = await checkAdminAccess();
	if (!accessCheck.authorized) {
		return NextResponse.json(
			{ error: accessCheck.error },
			{ status: accessCheck.status }
		);
	}

	const { userId } = await params;
	const client = await clerkClient();

	try {
		// Set the key to null to remove it (Clerk merges metadata, so we must explicitly nullify)
		await client.users.updateUserMetadata(userId, {
			publicMetadata: {
				has_premium_feature_access: null,
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error removing user metadata:", error);
		return NextResponse.json(
			{ error: "Failed to remove user metadata" },
			{ status: 500 }
		);
	}
}

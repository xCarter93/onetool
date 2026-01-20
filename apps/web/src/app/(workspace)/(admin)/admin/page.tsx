import { clerkClient } from "@clerk/nextjs/server";
import { OrgList } from "./components/org-list";

interface OrgWithUsers {
	org: {
		id: string;
		name: string;
		slug: string | null;
		createdAt: number;
		publicMetadata: Record<string, unknown>;
	};
	hasPremium: boolean;
	users: Array<{
		user: {
			id: string;
			firstName: string | null;
			lastName: string | null;
			emailAddresses: Array<{ emailAddress: string }>;
			imageUrl: string;
			lastSignInAt: number | null;
			createdAt: number;
			publicMetadata: Record<string, unknown>;
		};
		role: string;
		hasDirectPremium: boolean; // User's own premium metadata
		hasOrgPremium: boolean; // Inherited from org
	}>;
}

async function getAdminData(): Promise<{
	orgsWithUsers: OrgWithUsers[];
	usersWithoutOrg: Array<{
		id: string;
		firstName: string | null;
		lastName: string | null;
		emailAddresses: Array<{ emailAddress: string }>;
		imageUrl: string;
		lastSignInAt: number | null;
		createdAt: number;
		publicMetadata: Record<string, unknown>;
	}>;
}> {
	try {
		const client = await clerkClient();

		// Fetch all organizations
		const orgsResponse = await client.organizations.getOrganizationList({
			limit: 500,
		});

		// Fetch all users
		const usersResponse = await client.users.getUserList({
			limit: 500,
		});

		const allUsers = usersResponse.data;
		const userOrgMap = new Map<string, string[]>(); // userId -> orgIds

		// Build org data with users
		const orgsWithUsers: OrgWithUsers[] = await Promise.all(
			orgsResponse.data.map(async (org) => {
				const orgHasPremium =
					(org.publicMetadata as Record<string, unknown>)
						?.has_premium_feature_access === true;

				// Fetch memberships for this org
				const memberships =
					await client.organizations.getOrganizationMembershipList({
						organizationId: org.id,
						limit: 500,
					});

				const users = memberships.data
					.map((membership) => {
						const user = allUsers.find(
							(u) => u.id === membership.publicUserData?.userId
						);
						if (!user) return null;

						// Track which orgs this user belongs to
						const userOrgs = userOrgMap.get(user.id) || [];
						userOrgs.push(org.id);
						userOrgMap.set(user.id, userOrgs);

						const hasDirectPremium =
							(user.publicMetadata as Record<string, unknown>)
								?.has_premium_feature_access === true;

						return {
							user: {
								id: user.id,
								firstName: user.firstName,
								lastName: user.lastName,
								emailAddresses: user.emailAddresses.map((e) => ({
									emailAddress: e.emailAddress,
								})),
								imageUrl: user.imageUrl,
								lastSignInAt: user.lastSignInAt,
								createdAt: user.createdAt,
								publicMetadata: user.publicMetadata as Record<string, unknown>,
							},
							role: membership.role,
							hasDirectPremium,
							hasOrgPremium: orgHasPremium,
						};
					})
					.filter(Boolean) as OrgWithUsers["users"];

				return {
					org: {
						id: org.id,
						name: org.name,
						slug: org.slug,
						createdAt: org.createdAt,
						publicMetadata: org.publicMetadata as Record<string, unknown>,
					},
					hasPremium: orgHasPremium,
					users,
				};
			})
		);

		// Find users without any organization
		const usersWithoutOrg = allUsers
			.filter((user) => !userOrgMap.has(user.id))
			.map((user) => ({
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				emailAddresses: user.emailAddresses.map((e) => ({
					emailAddress: e.emailAddress,
				})),
				imageUrl: user.imageUrl,
				lastSignInAt: user.lastSignInAt,
				createdAt: user.createdAt,
				publicMetadata: user.publicMetadata as Record<string, unknown>,
			}));

		return { orgsWithUsers, usersWithoutOrg };
	} catch (error) {
		console.error("Failed to fetch admin data from Clerk:", error);
		throw new Error("Failed to load admin data. Please try again later.");
	}
}

export default async function AdminPage() {
	const { orgsWithUsers, usersWithoutOrg } = await getAdminData();

	const totalOrgs = orgsWithUsers.length;
	const totalUsers =
		orgsWithUsers.reduce((sum, org) => sum + org.users.length, 0) +
		usersWithoutOrg.length;
	const premiumOrgs = orgsWithUsers.filter((o) => o.hasPremium).length;

	// Count users with premium access (either direct or via org)
	const premiumUsers =
		orgsWithUsers.reduce(
			(sum, org) =>
				sum +
				org.users.filter((u) => u.hasDirectPremium || u.hasOrgPremium).length,
			0
		) +
		usersWithoutOrg.filter(
			(u) => u.publicMetadata?.has_premium_feature_access === true
		).length;

	return (
		<div className="relative p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Admin Dashboard
				</h1>
				<p className="text-muted-foreground">
					Manage users and organizations across OneTool
				</p>
			</div>

			{/* Summary Stats */}
			<div className="grid gap-4 md:grid-cols-4">
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Total Organizations</div>
					<div className="text-2xl font-semibold">{totalOrgs}</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Premium Orgs</div>
					<div className="text-2xl font-semibold">{premiumOrgs}</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Total Users</div>
					<div className="text-2xl font-semibold">{totalUsers}</div>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<div className="text-sm text-muted-foreground">Premium Users</div>
					<div className="text-2xl font-semibold">{premiumUsers}</div>
				</div>
			</div>

			{/* Org List with Users */}
			<OrgList orgsWithUsers={orgsWithUsers} usersWithoutOrg={usersWithoutOrg} />
		</div>
	);
}

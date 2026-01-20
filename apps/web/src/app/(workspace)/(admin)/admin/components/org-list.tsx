"use client";

import { useState } from "react";
import Image from "next/image";
import { User, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserSheet } from "./user-sheet";
import { OrgSheet } from "./org-sheet";
import { StyledSubDataGrid } from "./styled-sub-data-grid";

interface UserData {
	id: string;
	firstName: string | null;
	lastName: string | null;
	emailAddresses: Array<{ emailAddress: string }>;
	imageUrl: string;
	lastSignInAt: number | null;
	createdAt: number;
	publicMetadata: Record<string, unknown>;
}

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
		user: UserData;
		role: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	}>;
}

interface OrgListProps {
	orgsWithUsers: OrgWithUsers[];
	usersWithoutOrg: UserData[];
}

export function OrgList({ orgsWithUsers, usersWithoutOrg }: OrgListProps) {
	const [selectedUser, setSelectedUser] = useState<{
		user: UserData;
		role?: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	} | null>(null);
	const [selectedOrg, setSelectedOrg] = useState<OrgWithUsers | null>(null);

	const handleUserPremiumChange = (userId: string, newValue: boolean) => {
		// Update the local state to reflect the change
		if (selectedUser && selectedUser.user.id === userId) {
			setSelectedUser({
				...selectedUser,
				hasDirectPremium: newValue,
			});
		}
	};

	const handleOrgPremiumChange = (orgId: string, newValue: boolean) => {
		// Update the local state to reflect the change
		if (selectedOrg && selectedOrg.org.id === orgId) {
			setSelectedOrg({
				...selectedOrg,
				hasPremium: newValue,
			});
		}
	};

	return (
		<div className="space-y-6">
			{/* Organizations with Data Grid */}
			<StyledSubDataGrid
				orgsWithUsers={orgsWithUsers}
				onUserClick={setSelectedUser}
				onOrgClick={setSelectedOrg}
			/>

			{/* Users without organization */}
			{usersWithoutOrg.length > 0 && (
				<div className="space-y-2">
					<h2 className="text-lg font-semibold flex items-center gap-2">
						<User className="h-5 w-5" />
						Users without Organization ({usersWithoutOrg.length})
					</h2>
					<div className="rounded-lg border bg-card p-4 space-y-2">
						{usersWithoutOrg.map((user) => {
							const hasDirectPremium =
								user.publicMetadata?.has_premium_feature_access === true;
							return (
								<button
									key={user.id}
									onClick={() =>
										setSelectedUser({
											user,
											hasDirectPremium,
											hasOrgPremium: false,
										})
									}
									className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors text-left"
								>
									<div className="flex items-center gap-3">
										<Image
											src={user.imageUrl}
											alt={`${user.firstName ?? ""} ${user.lastName ?? ""}`}
											width={32}
											height={32}
											className="h-8 w-8 rounded-full"
										/>
										<div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium">
													{user.firstName} {user.lastName}
												</span>
												{hasDirectPremium && (
													<Badge
														variant="success"
														className="gap-1 text-[10px] px-1.5 py-0.5"
													>
														<Crown className="h-2.5 w-2.5" />
														Premium
													</Badge>
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{user.emailAddresses[0]?.emailAddress}
											</div>
										</div>
									</div>
									<Badge variant="secondary" className="text-xs">
										No org
									</Badge>
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* User Sheet */}
			<UserSheet
				user={selectedUser}
				isOpen={!!selectedUser}
				onOpenChange={(open) => {
					if (!open) setSelectedUser(null);
				}}
				onPremiumChange={handleUserPremiumChange}
			/>

			{/* Org Sheet */}
			<OrgSheet
				org={selectedOrg}
				isOpen={!!selectedOrg}
				onOpenChange={(open) => {
					if (!open) setSelectedOrg(null);
				}}
				onPremiumChange={handleOrgPremiumChange}
			/>
		</div>
	);
}

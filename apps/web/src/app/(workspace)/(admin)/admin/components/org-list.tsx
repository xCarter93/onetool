"use client";

import { useState } from "react";
import { ChevronRight, Building2, User, Crown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { UserSheet } from "./user-sheet";
import { OrgSheet } from "./org-sheet";

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
	const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
	const [selectedUser, setSelectedUser] = useState<{
		user: UserData;
		role?: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	} | null>(null);
	const [selectedOrg, setSelectedOrg] = useState<OrgWithUsers | null>(null);

	const toggleOrg = (orgId: string) => {
		setExpandedOrgs((prev) => {
			const next = new Set(prev);
			if (next.has(orgId)) {
				next.delete(orgId);
			} else {
				next.add(orgId);
			}
			return next;
		});
	};

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
			{/* Organizations */}
			<div className="space-y-2">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<Building2 className="h-5 w-5" />
					Organizations ({orgsWithUsers.length})
				</h2>
				<div className="space-y-2">
					{orgsWithUsers.map((orgData) => (
						<Collapsible
							key={orgData.org.id}
							open={expandedOrgs.has(orgData.org.id)}
							onOpenChange={() => toggleOrg(orgData.org.id)}
						>
							<div className="rounded-lg border bg-card">
								<CollapsibleTrigger asChild>
									<button className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-lg">
										<div className="flex items-center gap-3">
											<ChevronRight
												className={cn(
													"h-4 w-4 transition-transform",
													expandedOrgs.has(orgData.org.id) && "rotate-90"
												)}
											/>
											<div>
												<div className="flex items-center gap-2">
													<span
														className="font-medium hover:underline cursor-pointer"
														onClick={(e) => {
															e.stopPropagation();
															setSelectedOrg(orgData);
														}}
													>
														{orgData.org.name}
													</span>
													{orgData.hasPremium && (
														<Badge variant="success" className="gap-1">
															<Crown className="h-3 w-3" />
															Premium
														</Badge>
													)}
												</div>
												<div className="text-sm text-muted-foreground flex items-center gap-2">
													<Users className="h-3 w-3" />
													{orgData.users.length} member
													{orgData.users.length !== 1 ? "s" : ""}
												</div>
											</div>
										</div>
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="border-t px-4 py-2 space-y-1">
										{orgData.users.map((userData) => {
											const isPremium =
												userData.hasDirectPremium || userData.hasOrgPremium;
											return (
												<button
													key={userData.user.id}
													onClick={() => setSelectedUser(userData)}
													className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors text-left"
												>
													<div className="flex items-center gap-3">
														<img
															src={userData.user.imageUrl}
															alt=""
															className="h-8 w-8 rounded-full"
														/>
														<div>
															<div className="flex items-center gap-2">
																<span className="text-sm font-medium">
																	{userData.user.firstName}{" "}
																	{userData.user.lastName}
																</span>
																{isPremium && (
																	<Badge
																		variant="success"
																		className="gap-1 text-[10px] px-1.5 py-0.5"
																	>
																		<Crown className="h-2.5 w-2.5" />
																		{userData.hasOrgPremium &&
																		!userData.hasDirectPremium
																			? "Via Org"
																			: "Premium"}
																	</Badge>
																)}
															</div>
															<div className="text-xs text-muted-foreground">
																{userData.user.emailAddresses[0]?.emailAddress}
															</div>
														</div>
													</div>
													<Badge variant="outline" className="text-xs">
														{userData.role}
													</Badge>
												</button>
											);
										})}
									</div>
								</CollapsibleContent>
							</div>
						</Collapsible>
					))}
				</div>
			</div>

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
										<img
											src={user.imageUrl}
											alt=""
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

"use client";

import { useState } from "react";
import { Calendar, Crown, Users, Loader2, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import { Switch, SwitchWrapper } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

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
		};
		role: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	}>;
}

interface OrgSheetProps {
	org: OrgWithUsers | null;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onPremiumChange: (orgId: string, newValue: boolean) => void;
}

export function OrgSheet({
	org,
	isOpen,
	onOpenChange,
	onPremiumChange,
}: OrgSheetProps) {
	const { success, error } = useToast();
	const [isUpdating, setIsUpdating] = useState(false);

	if (!org) return null;

	const handlePremiumToggle = async (checked: boolean) => {
		setIsUpdating(true);
		try {
			const method = checked ? "POST" : "DELETE";
			const response = await fetch(
				`/api/admin/organizations/${org.org.id}/metadata`,
				{ method }
			);

			if (!response.ok) {
				throw new Error("Failed to update premium status");
			}

			onPremiumChange(org.org.id, checked);
			success(
				"Premium status updated",
				`${org.org.name} is now ${checked ? "premium" : "standard"}`
			);
		} catch (err) {
			console.error("Error updating premium status:", err);
			error("Error", "Failed to update premium status");
		} finally {
			setIsUpdating(false);
		}
	};

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-xl p-6">
				<SheetHeader className="border-b border-border pb-4">
					<div className="flex items-center gap-4">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
							<Building2 className="h-8 w-8 text-primary" />
						</div>
						<div>
							<SheetTitle className="text-xl font-semibold">
								{org.org.name}
							</SheetTitle>
							<SheetDescription className="flex items-center gap-2">
								{org.hasPremium && (
									<Badge variant="success" className="gap-1">
										<Crown className="h-3 w-3" />
										Premium
									</Badge>
								)}
								<Badge variant="outline" className="gap-1">
									<Users className="h-3 w-3" />
									{org.users.length} member{org.users.length !== 1 ? "s" : ""}
								</Badge>
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<div className="space-y-6 pt-6">
					{/* Org ID */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground">
							Clerk Organization ID
						</label>
						<div className="text-sm font-mono text-xs bg-muted p-2 rounded">
							{org.org.id}
						</div>
					</div>

					{/* Slug */}
					{org.org.slug && (
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">
								Slug
							</label>
							<div className="text-sm">{org.org.slug}</div>
						</div>
					)}

					{/* Created At */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Calendar className="h-4 w-4" />
							Created
						</label>
						<div className="text-sm">{formatDate(org.org.createdAt)}</div>
					</div>

					{/* Premium Toggle */}
					<div className="rounded-lg border bg-muted/30 p-4 space-y-3">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<label className="text-sm font-medium flex items-center gap-2">
									<Crown className="h-4 w-4 text-amber-500" />
									Organization Premium
								</label>
								<p className="text-xs text-muted-foreground">
									All members will have premium access
								</p>
							</div>
							<SwitchWrapper>
								<Switch
									checked={org.hasPremium}
									onCheckedChange={handlePremiumToggle}
									disabled={isUpdating}
								/>
								{isUpdating && (
									<Loader2 className="h-4 w-4 ml-2 animate-spin text-muted-foreground" />
								)}
							</SwitchWrapper>
						</div>
					</div>

					{/* Members */}
					<div className="space-y-3">
						<label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Users className="h-4 w-4" />
							Members
						</label>
						<div className="space-y-2">
							{org.users.map((userData) => {
								const isPremium =
									userData.hasDirectPremium || userData.hasOrgPremium;
								return (
									<div
										key={userData.user.id}
										className="flex items-center justify-between p-2 rounded-md bg-muted/50"
									>
										<div className="flex items-center gap-2">
											<img
												src={userData.user.imageUrl}
												alt=""
												className="h-6 w-6 rounded-full"
											/>
											<div>
												<div className="text-sm font-medium">
													{userData.user.firstName} {userData.user.lastName}
												</div>
												<div className="text-xs text-muted-foreground">
													{userData.user.emailAddresses[0]?.emailAddress}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-2">
											{isPremium && (
												<Crown className="h-3 w-3 text-amber-500" />
											)}
											<Badge variant="outline" className="text-xs">
												{userData.role}
											</Badge>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Public Metadata */}
					{Object.keys(org.org.publicMetadata).length > 0 && (
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">
								Public Metadata
							</label>
							<pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
								{JSON.stringify(org.org.publicMetadata, null, 2)}
							</pre>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

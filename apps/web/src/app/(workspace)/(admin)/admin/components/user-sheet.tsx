"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Calendar, Crown, Loader2, Building2 } from "lucide-react";
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

interface UserSheetProps {
	user: {
		user: UserData;
		role?: string;
		hasDirectPremium: boolean;
		hasOrgPremium: boolean;
	} | null;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onPremiumChange: (userId: string, newValue: boolean) => void;
}

export function UserSheet({
	user,
	isOpen,
	onOpenChange,
	onPremiumChange,
}: UserSheetProps) {
	const router = useRouter();
	const { success, error } = useToast();
	const [isUpdating, setIsUpdating] = useState(false);

	if (!user) return null;

	const isPremium = user.hasDirectPremium || user.hasOrgPremium;

	const handlePremiumToggle = async (checked: boolean) => {
		setIsUpdating(true);
		try {
			const method = checked ? "POST" : "DELETE";
			const response = await fetch(
				`/api/admin/users/${user.user.id}/metadata`,
				{ method }
			);

			if (!response.ok) {
				throw new Error("Failed to update premium status");
			}

			onPremiumChange(user.user.id, checked);
			router.refresh();
			success(
				"Premium status updated",
				`${user.user.firstName} ${user.user.lastName} is now ${checked ? "premium" : "standard"}`
			);
		} catch (err) {
			console.error("Error updating premium status:", err);
			error("Error", "Failed to update premium status");
		} finally {
			setIsUpdating(false);
		}
	};

	const formatDate = (timestamp: number | null) => {
		if (!timestamp) return "Never";
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<Sheet open={isOpen} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-xl p-6">
				<SheetHeader className="border-b border-border pb-4">
					<div className="flex items-center gap-4">
						<img
							src={user.user.imageUrl}
							alt={`${user.user.firstName ?? ""} ${user.user.lastName ?? ""}`}
							className="h-16 w-16 rounded-full"
						/>
						<div>
							<SheetTitle className="text-xl font-semibold">
								{user.user.firstName} {user.user.lastName}
							</SheetTitle>
							<SheetDescription className="flex items-center gap-2 flex-wrap">
								{user.role && (
									<Badge variant="outline">{user.role}</Badge>
								)}
								{isPremium && (
									<Badge variant="success" className="gap-1">
										<Crown className="h-3 w-3" />
										{user.hasOrgPremium && !user.hasDirectPremium
											? "Premium (via Org)"
											: "Premium"}
									</Badge>
								)}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<div className="space-y-6 pt-6">
					{/* Email */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Mail className="h-4 w-4" />
							Email
						</label>
						<div className="text-sm">
							{user.user.emailAddresses[0]?.emailAddress || "No email"}
						</div>
					</div>

					{/* User ID */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground">
							Clerk User ID
						</label>
						<div className="text-sm font-mono text-xs bg-muted p-2 rounded">
							{user.user.id}
						</div>
					</div>

					{/* Created At */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Calendar className="h-4 w-4" />
							Created
						</label>
						<div className="text-sm">{formatDate(user.user.createdAt)}</div>
					</div>

					{/* Last Sign In */}
					<div className="space-y-2">
						<label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Calendar className="h-4 w-4" />
							Last Sign In
						</label>
						<div className="text-sm">{formatDate(user.user.lastSignInAt)}</div>
					</div>

					{/* Org Premium Notice */}
					{user.hasOrgPremium && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 p-4">
							<div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
								<Building2 className="h-4 w-4" />
								<span className="text-sm font-medium">
									Premium via Organization
								</span>
							</div>
							<p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
								This user has premium access because their organization is
								premium.
							</p>
						</div>
					)}

					{/* Direct Premium Toggle */}
					<div className="rounded-lg border bg-muted/30 p-4 space-y-3">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<label className="text-sm font-medium flex items-center gap-2">
									<Crown className="h-4 w-4 text-amber-500" />
									Direct Premium Access
								</label>
								<p className="text-xs text-muted-foreground">
									Grant this user direct premium access (independent of org)
								</p>
							</div>
							<SwitchWrapper>
								<Switch
									checked={user.hasDirectPremium}
									onCheckedChange={handlePremiumToggle}
									disabled={isUpdating}
								/>
								{isUpdating && (
									<Loader2 className="h-4 w-4 ml-2 animate-spin text-muted-foreground" />
								)}
							</SwitchWrapper>
						</div>
					</div>

					{/* Public Metadata */}
					{Object.keys(user.user.publicMetadata).length > 0 && (
						<div className="space-y-2">
							<label className="text-sm font-medium text-muted-foreground">
								Public Metadata
							</label>
							<pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
								{JSON.stringify(user.user.publicMetadata, null, 2)}
							</pre>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

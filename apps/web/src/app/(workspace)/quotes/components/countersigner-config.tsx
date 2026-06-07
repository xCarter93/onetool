"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StyledMultiSelector } from "@/components/ui/styled/styled-multi-selector";
import { StyledListProvider } from "@/components/ui/styled/styled-list";
import { useToast } from "@/hooks/use-toast";
import { PenTool, Users, User, Mail } from "lucide-react";

interface CountersignerConfigProps {
	quoteId: Id<"quotes">;
	requiresCountersignature?: boolean;
	countersignerId?: Id<"users">;
	signingOrder?: "client_first" | "org_first";
	primaryContact?: {
		firstName: string;
		lastName: string;
		email?: string;
	} | null;
}

type SignerItem = {
	id: string;
	type: "client" | "organization";
	name: string;
	email: string;
	order: number;
};

export function CountersignerConfig({
	quoteId,
	requiresCountersignature = false,
	countersignerId,
	signingOrder = "client_first",
	primaryContact,
}: CountersignerConfigProps) {
	const toast = useToast();
	const users = useQuery(api.users.listByOrg);
	const updateQuote = useMutation(api.quotes.update);

	// Local state for optimistic updates
	const [enabled, setEnabled] = useState(requiresCountersignature);
	const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
		countersignerId
	);
	const [order, setOrder] = useState<"client_first" | "org_first">(signingOrder);
	const [isSaving, setIsSaving] = useState(false);

	// Sync with prop changes
	const [prevProps, setPrevProps] = useState({
		requiresCountersignature,
		countersignerId,
		signingOrder,
	});
	if (
		prevProps.requiresCountersignature !== requiresCountersignature ||
		prevProps.countersignerId !== countersignerId ||
		prevProps.signingOrder !== signingOrder
	) {
		setPrevProps({ requiresCountersignature, countersignerId, signingOrder });
		setEnabled(requiresCountersignature);
		setSelectedUserId(countersignerId);
		setOrder(signingOrder);
	}

	// Get selected countersigner details
	const selectedCountersigner = useMemo(() => {
		if (!selectedUserId || !users) return null;
		return users.find((u) => u._id === selectedUserId);
	}, [selectedUserId, users]);

	// Build signer list for drag-and-drop
	const signers = useMemo<SignerItem[]>(() => {
		if (!enabled || !selectedCountersigner || !primaryContact) return [];

		const clientSigner: SignerItem = {
			id: "client",
			type: "client",
			name: `${primaryContact.firstName} ${primaryContact.lastName}`,
			email: primaryContact.email || "",
			order: order === "client_first" ? 1 : 2,
		};

		const orgSigner: SignerItem = {
			id: "organization",
			type: "organization",
			name: selectedCountersigner.name || selectedCountersigner.email,
			email: selectedCountersigner.email,
			order: order === "org_first" ? 1 : 2,
		};

		// Sort by order
		return [clientSigner, orgSigner].sort((a, b) => a.order - b.order);
	}, [enabled, selectedCountersigner, primaryContact, order]);

	const handleToggle = async (checked: boolean) => {
		setEnabled(checked);

		if (!checked) {
			// Disabling - clear countersigner settings
			setIsSaving(true);
			try {
				await updateQuote({
					id: quoteId,
					requiresCountersignature: false,
					countersignerId: undefined,
					signingOrder: undefined,
				});
				setSelectedUserId(undefined);
				toast.success("Updated", "Countersignature requirement removed");
			} catch (error) {
				setEnabled(true); // Revert on error
				const message =
					error instanceof Error ? error.message : "Failed to update";
				toast.error("Error", message);
			} finally {
				setIsSaving(false);
			}
		}
	};

	const handleUserChange = async (values: string[]) => {
		const userId = values[0] as Id<"users"> | undefined;
		setSelectedUserId(userId);

		if (userId) {
			setIsSaving(true);
			try {
				await updateQuote({
					id: quoteId,
					requiresCountersignature: true,
					countersignerId: userId,
					signingOrder: order,
				});
				toast.success("Updated", "Countersigner assigned");
			} catch (error) {
				setSelectedUserId(countersignerId); // Revert on error
				const message =
					error instanceof Error ? error.message : "Failed to update";
				toast.error("Error", message);
			} finally {
				setIsSaving(false);
			}
		}
	};

	const handleReorder = async (newItems: SignerItem[]) => {
		// Determine new order based on which item is first
		const firstItem = newItems[0];
		const newOrder: "client_first" | "org_first" =
			firstItem.type === "client" ? "client_first" : "org_first";

		if (newOrder === order) return; // No change

		setOrder(newOrder);

		if (selectedUserId) {
			setIsSaving(true);
			try {
				await updateQuote({
					id: quoteId,
					requiresCountersignature: true,
					countersignerId: selectedUserId as Id<"users">,
					signingOrder: newOrder,
				});
				toast.success("Updated", "Signing order changed");
			} catch (error) {
				setOrder(signingOrder); // Revert on error
				const message =
					error instanceof Error ? error.message : "Failed to update";
				toast.error("Error", message);
			} finally {
				setIsSaving(false);
			}
		}
	};

	const userOptions =
		users?.map((user) => ({
			label: user.name || user.email,
			value: user._id,
		})) || [];

	const renderSignerItem = (item: SignerItem, index: number) => (
		<div className="flex items-center gap-4 flex-1">
			<div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
				{index + 1}
			</div>
			<div className="flex items-center gap-3 flex-1 min-w-0">
				{item.type === "client" ? (
					<User className="h-4 w-4 text-muted-foreground shrink-0" />
				) : (
					<Users className="h-4 w-4 text-muted-foreground shrink-0" />
				)}
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm text-foreground truncate">
						{item.name}
					</p>
					<p className="text-xs text-muted-foreground truncate flex items-center gap-1">
						<Mail className="h-3 w-3" />
						{item.email}
					</p>
				</div>
			</div>
			<div className="text-xs text-muted-foreground shrink-0">
				{item.type === "client" ? "Client" : "Organization"}
			</div>
		</div>
	);

	return (
		<div className="bg-card dark:bg-card backdrop-blur-md border border-border dark:border-border rounded-xl shadow-lg dark:shadow-black/50 ring-1 ring-border/30 dark:ring-border/50">
			<Card className="bg-transparent border-none shadow-none ring-0">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-xl">
						<PenTool className="h-5 w-5" />
						Countersignature Settings
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* Toggle for enabling countersignature */}
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="countersign-toggle"
								className="text-base font-medium"
							>
								Requires organization countersignature
							</Label>
							<p className="text-sm text-muted-foreground">
								A team member must sign after the client approves
							</p>
						</div>
						<Switch
							id="countersign-toggle"
							checked={enabled}
							onCheckedChange={handleToggle}
							disabled={isSaving}
						/>
					</div>

					{/* Configuration options when enabled */}
					{enabled && (
						<div className="space-y-6 pt-4 border-t border-border">
							{/* Countersigner Selection */}
							<div className="space-y-2">
								<Label className="flex items-center gap-2 text-sm font-medium">
									<Users className="h-4 w-4 text-primary" />
									Select Countersigner
								</Label>
								<StyledMultiSelector
									options={userOptions}
									value={selectedUserId ? [selectedUserId] : []}
									onValueChange={handleUserChange}
									placeholder="Select team member to countersign"
									maxCount={1}
									disabled={isSaving}
									className="w-full"
								/>
								{!selectedUserId && enabled && (
									<p className="text-xs text-amber-600 dark:text-amber-400">
										Please select a team member to countersign
									</p>
								)}
							</div>

							{/* Signing Order - Drag and Drop */}
							{selectedUserId && (
								<div className="space-y-3">
									<Label className="flex items-center gap-2 text-sm font-medium">
										<span className="text-primary">#</span>
										Signing Order
									</Label>
									{primaryContact && signers.length > 0 ? (
										<>
											<p className="text-xs text-muted-foreground">
												Drag to reorder who signs first
											</p>
											<StyledListProvider
												items={signers}
												onReorder={handleReorder}
												renderItem={renderSignerItem}
											/>
										</>
									) : (
										<div className="flex items-center gap-2 px-3 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
											<User className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
											<p className="text-sm text-amber-700 dark:text-amber-400">
												Add a primary contact to the client to define the signing order
											</p>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

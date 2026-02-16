"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StyledMultiSelector } from "@/components/ui/styled/styled-multi-selector";
import { StyledListProvider } from "@/components/ui/styled/styled-list";
import { SignatureProgressBar } from "@/app/(workspace)/quotes/components/signature-progress-bar";
import Accordion from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Users, User, Mail, FileSignature } from "lucide-react";

type SignatureStatus =
	| "Sent"
	| "Viewed"
	| "Signed"
	| "Completed"
	| "Declined"
	| "Revoked"
	| "Expired";

type SignerItem = {
	id: string;
	type: "client" | "organization";
	name: string;
	email: string;
	order: number;
};

interface DocumentWithSignature {
	_id: string;
	version: number;
	generatedAt: number;
	boldsign: {
		status: SignatureStatus;
		sentAt?: number;
		viewedAt?: number;
		signedAt?: number;
		completedAt?: number;
		declinedAt?: number;
		revokedAt?: number;
		expiredAt?: number;
		sentTo: Array<{
			name: string;
			email: string;
			signerType: string;
		}>;
	};
}

interface SignaturesTabProps {
	quoteId: Id<"quotes">;
	requiresCountersignature?: boolean;
	countersignerId?: Id<"users">;
	signingOrder?: "client_first" | "org_first";
	primaryContact: Doc<"clientContacts"> | null | undefined;
	documentsWithSignatures: DocumentWithSignature[] | null | undefined;
}

export function SignaturesTab({
	quoteId,
	requiresCountersignature = false,
	countersignerId,
	signingOrder = "client_first",
	primaryContact,
	documentsWithSignatures,
}: SignaturesTabProps) {
	const toast = useToast();
	const users = useQuery(api.users.listByOrg);
	const updateQuote = useMutation(api.quotes.update);

	// Countersigner state
	const [enabled, setEnabled] = useState(requiresCountersignature);
	const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
		countersignerId
	);
	const [order, setOrder] =
		useState<"client_first" | "org_first">(signingOrder);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		setEnabled(requiresCountersignature);
		setSelectedUserId(countersignerId);
		setOrder(signingOrder);
	}, [requiresCountersignature, countersignerId, signingOrder]);

	const selectedCountersigner = useMemo(() => {
		if (!selectedUserId || !users) return null;
		return users.find((u) => u._id === selectedUserId);
	}, [selectedUserId, users]);

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

		return [clientSigner, orgSigner].sort((a, b) => a.order - b.order);
	}, [enabled, selectedCountersigner, primaryContact, order]);

	const handleToggle = async (checked: boolean) => {
		setEnabled(checked);
		if (!checked) {
			setIsSaving(true);
			try {
				await updateQuote({
					id: quoteId,
					requiresCountersignature: false,
					countersignerId: undefined,
					signingOrder: undefined,
				});
				setSelectedUserId(undefined);
				toast.success(
					"Updated",
					"Countersignature requirement removed"
				);
			} catch (error) {
				setEnabled(true);
				const message =
					error instanceof Error
						? error.message
						: "Failed to update";
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
				setSelectedUserId(countersignerId);
				const message =
					error instanceof Error
						? error.message
						: "Failed to update";
				toast.error("Error", message);
			} finally {
				setIsSaving(false);
			}
		}
	};

	const handleReorder = async (newItems: SignerItem[]) => {
		const firstItem = newItems[0];
		const newOrder: "client_first" | "org_first" =
			firstItem.type === "client" ? "client_first" : "org_first";
		if (newOrder === order) return;
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
				setOrder(signingOrder);
				const message =
					error instanceof Error
						? error.message
						: "Failed to update";
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

	const hasSignatures =
		documentsWithSignatures && documentsWithSignatures.length > 0;

	return (
		<div className="space-y-8">
			{/* Countersignature Settings Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Countersignature Settings
					</h3>
				</div>
				<Separator className="mb-4" />

				<div className="space-y-6">
					{/* Toggle */}
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="countersign-toggle"
								className="text-base font-medium"
							>
								Requires organization countersignature
							</Label>
							<p className="text-sm text-muted-foreground">
								A team member must sign after the client
								approves
							</p>
						</div>
						<Switch
							id="countersign-toggle"
							checked={enabled}
							onCheckedChange={handleToggle}
							disabled={isSaving}
						/>
					</div>

					{/* Configuration when enabled */}
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
									value={
										selectedUserId
											? [selectedUserId]
											: []
									}
									onValueChange={handleUserChange}
									placeholder="Select team member to countersign"
									maxCount={1}
									disabled={isSaving}
									className="w-full"
								/>
								{!selectedUserId && enabled && (
									<p className="text-xs text-amber-600 dark:text-amber-400">
										Please select a team member to
										countersign
									</p>
								)}
							</div>

							{/* Signing Order */}
							{selectedUserId && (
								<div className="space-y-3">
									<Label className="flex items-center gap-2 text-sm font-medium">
										<span className="text-primary">
											#
										</span>
										Signing Order
									</Label>
									{primaryContact &&
									signers.length > 0 ? (
										<>
											<p className="text-xs text-muted-foreground">
												Drag to reorder who signs
												first
											</p>
											<StyledListProvider
												items={signers}
												onReorder={handleReorder}
												renderItem={
													renderSignerItem
												}
											/>
										</>
									) : (
										<div className="flex items-center gap-2 px-3 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg">
											<User className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
											<p className="text-sm text-amber-700 dark:text-amber-400">
												Add a primary contact to
												the client to define the
												signing order
											</p>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Signature Status Section */}
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Signature Status
					</h3>
				</div>
				<Separator className="mb-4" />

				{hasSignatures ? (
					<Accordion
						items={documentsWithSignatures.map((doc) => {
							const lastUpdate =
								doc.boldsign.completedAt ||
								doc.boldsign.declinedAt ||
								doc.boldsign.revokedAt ||
								doc.boldsign.expiredAt ||
								doc.boldsign.signedAt ||
								doc.boldsign.viewedAt ||
								doc.boldsign.sentAt ||
								doc.generatedAt;

							const statusVariant =
								doc.boldsign.status === "Completed"
									? "default"
									: doc.boldsign.status === "Declined" ||
										  doc.boldsign.status === "Revoked" ||
										  doc.boldsign.status === "Expired"
										? "destructive"
										: "secondary";

							const formattedDate = new Date(
								lastUpdate
							).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							});

							return {
								title: `Version ${doc.version} - ${doc.boldsign.status} - ${formattedDate}`,
								content: (
									<div className="space-y-4">
										<div className="flex items-center gap-3 pb-3 border-b border-border">
											<Badge
												variant="outline"
												className="text-xs"
											>
												v{doc.version}
											</Badge>
											<Badge
												variant={statusVariant}
												className="text-xs"
											>
												{doc.boldsign.status}
											</Badge>
											<span className="text-xs text-muted-foreground ml-auto">
												Last updated: {formattedDate}
											</span>
										</div>

										<SignatureProgressBar
											status={doc.boldsign.status}
											events={[
												{
													type: "Sent",
													timestamp:
														doc.boldsign.sentAt,
												},
												{
													type: "Viewed",
													timestamp:
														doc.boldsign.viewedAt,
												},
												{
													type: "Signed",
													timestamp:
														doc.boldsign.signedAt,
												},
												{
													type: doc.boldsign.status,
													timestamp:
														doc.boldsign
															.completedAt ||
														doc.boldsign
															.declinedAt ||
														doc.boldsign
															.revokedAt ||
														doc.boldsign
															.expiredAt,
												},
											]}
										/>

										<div className="pt-4 border-t border-border">
											<p className="font-medium mb-3 text-sm text-foreground">
												Sent to:
											</p>
											<ul className="space-y-2">
												{doc.boldsign.sentTo.map(
													(recipient, i) => (
														<li
															key={i}
															className="flex items-center justify-between text-sm"
														>
															<span className="text-muted-foreground">
																<span className="font-medium text-foreground">
																	{
																		recipient.name
																	}
																</span>{" "}
																(
																{
																	recipient.email
																}
																)
															</span>
															<Badge
																variant="outline"
																className="text-xs"
															>
																{
																	recipient.signerType
																}
															</Badge>
														</li>
													)
												)}
											</ul>
										</div>
									</div>
								),
							};
						})}
					/>
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-3">
							<FileSignature className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm font-medium text-foreground mb-1">
							No signature requests sent
						</p>
						<p className="text-sm text-muted-foreground">
							Generate a PDF and send it to the client for
							signature
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

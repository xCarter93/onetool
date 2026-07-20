"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { Separator } from "@/components/ui/separator";
import { MultiSelector } from "@/components/shared/multi-selector";
import { ListProvider } from "@/components/shared/sortable-list";
import { SignatureProgressBar } from "@/app/(workspace)/quotes/components/signature-progress-bar";
import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import {
	Users,
	User,
	Mail,
	FileSignature,
	PenLine,
	Trash2,
} from "lucide-react";

type SignatureStatus =
	| "Draft"
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
		draftSavedAt?: number;
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
	const router = useRouter();
	const users = useQuery(api.users.listByOrg);
	const updateQuote = useMutation(api.quotes.update);
	const discardRequest = useAction(
		api.boldsignActions.discardEmbeddedSignatureRequest
	);

	// Confirmation for discarding an unsent draft from this tab. Discard always
	// targets the quote's live draft, which the backend resolves from the latest
	// document version — the label just names it for the dialog copy.
	const [discardOpen, setDiscardOpen] = useState(false);
	const draftVersionLabel = String(
		documentsWithSignatures?.find((d) => d.boldsign.status === "Draft")
			?.version ?? ""
	);

	// Countersigner state
	const [enabled, setEnabled] = useState(requiresCountersignature);
	const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
		countersignerId
	);
	const [order, setOrder] =
		useState<"client_first" | "org_first">(signingOrder);
	const [isSaving, setIsSaving] = useState(false);

	// Resync local state when props change
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
								<MultiSelector
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
											<ListProvider
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
					<Accordion>
						{documentsWithSignatures.map((doc) => {
							const isDraft = doc.boldsign.status === "Draft";
							// A draft has no signature events, so without draftSavedAt
							// this falls back to the PDF's generatedAt — which can be
							// weeks older than the draft itself.
							const lastUpdate =
								doc.boldsign.completedAt ||
								doc.boldsign.declinedAt ||
								doc.boldsign.revokedAt ||
								doc.boldsign.expiredAt ||
								doc.boldsign.signedAt ||
								doc.boldsign.viewedAt ||
								doc.boldsign.sentAt ||
								doc.boldsign.draftSavedAt ||
								doc.generatedAt;

							const formattedDate = new Date(
								lastUpdate
							).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							});

							return (
								<AccordionItem key={doc._id} value={doc._id}>
									<AccordionTrigger>
										{`Version ${doc.version} - ${isDraft ? "Draft, not sent" : doc.boldsign.status} - ${formattedDate}`}
									</AccordionTrigger>
									<AccordionContent>
										<div className="space-y-4">
											<div className="flex items-center gap-3 pb-3 border-b border-border">
												<Badge
													variant="outline"
													className="text-xs"
												>
													v{doc.version}
												</Badge>
												{doc.boldsign.status === "Completed" ? (
													<StatusBadge
														status="completed"
														appearance="solid"
														className="text-xs"
													>
														Completed
													</StatusBadge>
												) : (
													<StatusBadge
														status={doc.boldsign.status.toLowerCase()}
														className="text-xs"
													>
														{isDraft
															? "Draft, not sent"
															: doc.boldsign.status}
													</StatusBadge>
												)}
												<span className="text-xs text-muted-foreground ml-auto">
													{isDraft ? "Saved" : "Last updated"}:{" "}
													{formattedDate}
												</span>
											</div>

											{isDraft && (
												<div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
													<p className="text-sm text-muted-foreground">
														This draft hasn&apos;t been sent — nobody
														has been emailed yet. Pick up where you
														left off, or discard it.
													</p>
													<div className="flex shrink-0 gap-2">
														<Button
															size="sm"
															onClick={() =>
																router.push(`/quotes/${quoteId}/sign`)
															}
														>
															<PenLine className="h-4 w-4" />
															Resume editing
														</Button>
														<Button
															size="sm"
															variant="outline"
															onClick={() => setDiscardOpen(true)}
														>
															<Trash2 className="h-4 w-4" />
															Discard
														</Button>
													</div>
												</div>
											)}

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
													{isDraft ? "Will be sent to:" : "Sent to:"}
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
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
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

			<DeleteConfirmationModal
				isOpen={discardOpen}
				onClose={() => setDiscardOpen(false)}
				onConfirm={async () => {
					const result = await discardRequest({ quoteId });
					if (!result.discarded) {
						throw new Error(
							"The draft could not be removed from BoldSign. Please try again."
						);
					}
				}}
				title="Discard signature draft"
				itemName={`Version ${draftVersionLabel}`}
				itemType="Draft"
			/>
		</div>
	);
}

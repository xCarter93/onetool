"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { Lock, Mail, UserPlus, Trash2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
} from "@/components/reui/frame";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/ui/select";
import {
	Item,
	ItemMedia,
	ItemContent,
	ItemTitle,
	ItemActions,
} from "@/components/ui/item";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useSaveValidation } from "../_hooks/use-save-validation";
import { Eyebrow, SectionHeading } from "./settings-card";
import { TeamMembersTable } from "./team-members-table";
import {
	ADMIN_ROLE,
	MEMBER_ROLE,
	ROLE_OPTIONS,
	INVITATIONS_PARAMS,
	roleLabel,
	clerkErr,
} from "../_lib/org-members";

export function TeamTab() {
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const { organization, membership, invitations, isLoaded } =
		useOrganization(INVITATIONS_PARAMS);

	const isAdmin = membership?.role === ADMIN_ROLE;

	type InviteRow = NonNullable<
		NonNullable<typeof invitations>["data"]
	>[number];

	const {
		showErrors: inviteShowErrors,
		markSaveAttempt: markInviteAttempt,
		clearErrors: clearInviteErrors,
	} = useSaveValidation();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState(MEMBER_ROLE);
	const [inviting, setInviting] = useState(false);
	const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
	const inviteInvalid = inviteShowErrors && !inviteEmail.trim();

	const handleInvite = async () => {
		if (!organization) return;
		markInviteAttempt();
		const email = inviteEmail.trim();
		if (!email) return;
		setInviting(true);
		try {
			await organization.inviteMember({ emailAddress: email, role: inviteRole });
			await invitations?.revalidate?.();
			setInviteEmail("");
			clearInviteErrors();
			toast.success("Invitation sent", `Invited ${email}.`);
		} catch (error) {
			toast.error("Couldn't send invitation", clerkErr(error));
		} finally {
			setInviting(false);
		}
	};

	const handleRevoke = async (invitation: InviteRow) => {
		const confirmed = await confirmDialog({
			title: "Revoke invitation",
			message: `Revoke the invitation for ${invitation.emailAddress}?`,
			confirmLabel: "Revoke",
			cancelLabel: "Cancel",
			variant: "destructive",
		});
		if (!confirmed) return;
		setPendingInviteId(invitation.id);
		try {
			await invitation.revoke();
			await invitations?.revalidate?.();
			toast.success("Invitation revoked", "The invite is no longer valid.");
		} catch (error) {
			toast.error("Couldn't revoke invitation", clerkErr(error));
		} finally {
			setPendingInviteId(null);
		}
	};

	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const pendingInvites = (invitations?.data ?? []).filter(
		(invitation) => invitation.status === "pending",
	);
	const viewOnlyBadge = !isAdmin ? (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
			<Lock className="h-3 w-3" aria-hidden="true" /> View only
		</span>
	) : undefined;

	return (
		<div className="space-y-8">
			<SectionHeading
				title="Team"
				description="Manage who's on your team, their roles, and what they can access."
				aside={viewOnlyBadge}
			/>

			<TeamMembersTable />

			{isAdmin && (
				<Frame>
					<FrameHeader>
						<FrameTitle>Invitations</FrameTitle>
						<FrameDescription>
							Invite teammates by email. They&apos;ll get a link to join this
							organization.
						</FrameDescription>
					</FrameHeader>

					<FramePanel className="p-0">
						<div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
							<Field
								className="flex-1"
								data-invalid={inviteInvalid || undefined}
							>
								<FieldLabel htmlFor="invite-email" className="sr-only">
									Email address
								</FieldLabel>
								<InputGroup className={cn(inviting && "opacity-70")}>
									<InputGroupAddon>
										<Mail />
									</InputGroupAddon>
									<InputGroupInput
										id="invite-email"
										type="email"
										inputMode="email"
										placeholder="teammate@business.com"
										value={inviteEmail}
										disabled={inviting}
										aria-invalid={inviteInvalid || undefined}
										onChange={(event) => setInviteEmail(event.target.value)}
									/>
								</InputGroup>
								{inviteInvalid && (
									<FieldError>Enter an email address to invite.</FieldError>
								)}
							</Field>
							<Select
								value={inviteRole}
								onValueChange={(value) => {
									if (value) setInviteRole(value);
								}}
								disabled={inviting}
							>
								<SelectTrigger className="sm:w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ROLE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button onClick={handleInvite} disabled={inviting}>
								{inviting ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<UserPlus className="h-4 w-4" />
								)}
								Send invite
							</Button>
						</div>

						{pendingInvites.length > 0 ? (
							<div className="border-t border-border">
								<div className="px-4 pt-3.5">
									<Eyebrow>Pending</Eyebrow>
								</div>
								<div className="divide-y divide-border">
									{pendingInvites.map((invitation) => {
										const rowBusy = pendingInviteId === invitation.id;
										return (
											<Item
												key={invitation.id}
												size="sm"
												className="px-4 py-3.5"
											>
												<ItemMedia variant="icon">
													<Mail className="h-4 w-4" />
												</ItemMedia>
												<ItemContent>
													<ItemTitle>{invitation.emailAddress}</ItemTitle>
												</ItemContent>
												<ItemActions>
													<Badge
														variant={
															invitation.role === ADMIN_ROLE
																? "primary-light"
																: "secondary"
														}
														radius="full"
														size="lg"
													>
														{roleLabel(invitation.role)}
													</Badge>
													<Button
														variant="outline"
														size="icon-sm"
														aria-label="Revoke invitation"
														disabled={rowBusy}
														onClick={() => handleRevoke(invitation)}
														className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
													>
														{rowBusy ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<Trash2 className="h-4 w-4" />
														)}
													</Button>
												</ItemActions>
											</Item>
										);
									})}
								</div>
							</div>
						) : (
							<div className="border-t border-border px-4 py-3.5">
								<p className="text-sm text-muted-foreground">
									No pending invitations.
								</p>
							</div>
						)}
					</FramePanel>
				</Frame>
			)}
		</div>
	);
}

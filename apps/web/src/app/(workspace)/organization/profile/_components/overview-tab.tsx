"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
	useOrganization,
	useClerk,
	useReverification,
} from "@clerk/nextjs";
import {
	isClerkAPIResponseError,
	isReverificationCancelledError,
} from "@clerk/nextjs/errors";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
	ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	SortingState,
	useReactTable,
} from "@tanstack/react-table";
import {
	Lock,
	Mail,
	ShieldCheck,
	Upload,
	UserPlus,
	Trash2,
	LogOut,
	Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
	Avatar,
	AvatarImage,
	AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
	FrameFooter,
} from "@/components/reui/frame";
import {
	DataGrid,
	DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
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
	ItemDescription,
	ItemActions,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { api } from "@onetool/backend/convex/_generated/api";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { useSaveValidation } from "../_hooks/use-save-validation";
import { useRegisterSettingsSave } from "../_hooks/use-settings-save";
import { Eyebrow, SectionHeading } from "./settings-card";

// Clerk role keys round-trip verbatim through the org webhook. The instance uses
// only the two Clerk defaults; gate on Clerk's live membership.role (NOT the
// Convex `role` column, which is written inconsistently).
const ADMIN_ROLE = "org:admin";
const MEMBER_ROLE = "org:member";
const ROLE_OPTIONS = [
	{ value: ADMIN_ROLE, label: "Admin" },
	{ value: MEMBER_ROLE, label: "Member" },
];

// Opt-in fetch params, hoisted so the object identity is stable across renders.
const ORGANIZATION_PARAMS = {
	memberships: { pageSize: 20 },
	invitations: { pageSize: 20 },
};

function roleLabel(role: string | undefined | null) {
	if (role === ADMIN_ROLE) return "Admin";
	if (role === MEMBER_ROLE) return "Member";
	return role ?? "Member";
}

function getInitials(name: string, email?: string) {
	const src = name.trim() || (email ?? "").trim();
	const parts = src.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	if (src.length >= 2) return src.slice(0, 2).toUpperCase();
	return src.slice(0, 1).toUpperCase() || "?";
}

function memberDisplayName(member: {
	publicUserData?:
		| { firstName?: string | null; lastName?: string | null; identifier?: string | null }
		| null;
}) {
	const info = member.publicUserData;
	const name = `${info?.firstName ?? ""} ${info?.lastName ?? ""}`.trim();
	return name || info?.identifier || "";
}

function clerkErr(err: unknown, fallback = "Something went wrong.") {
	if (isClerkAPIResponseError(err)) {
		return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? fallback;
	}
	return err instanceof Error ? err.message : fallback;
}

export function OverviewTab() {
	const router = useRouter();
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const { setActive } = useClerk();
	const { isOwner } = useOrgOwner();
	const updateOrganization = useMutation(api.organizations.update);

	const { organization, membership, memberships, invitations, isLoaded } =
		useOrganization(ORGANIZATION_PARAMS);

	const isAdmin = membership?.role === ADMIN_ROLE;

	type MemberRow = NonNullable<NonNullable<typeof memberships>["data"]>[number];
	type InviteRow = NonNullable<
		NonNullable<typeof invitations>["data"]
	>[number];

	// Reverification-guarded destroy (Clerk renders its own step-up modal).
	const deleteOrganization = useReverification(() => organization!.destroy());

	// Identity: org name (editable) + logo.
	const {
		showErrors: nameShowErrors,
		markSaveAttempt: markNameAttempt,
		clearErrors: clearNameErrors,
	} = useSaveValidation();
	const [orgName, setOrgName] = useState("");
	const [nameDirty, setNameDirty] = useState(false);
	const [savingName, setSavingName] = useState(false);
	const [uploadingLogo, setUploadingLogo] = useState(false);
	const logoInputRef = useRef<HTMLInputElement>(null);

	// Seed / re-sync the name input from Clerk unless the user has unsaved edits.
	const [prevOrgName, setPrevOrgName] = useState<string | undefined>(undefined);
	const currentOrgName = organization?.name;
	if (currentOrgName !== prevOrgName) {
		setPrevOrgName(currentOrgName);
		if (currentOrgName !== undefined && !nameDirty) {
			setOrgName(currentOrgName);
		}
	}

	// Invitations form.
	const {
		showErrors: inviteShowErrors,
		markSaveAttempt: markInviteAttempt,
		clearErrors: clearInviteErrors,
	} = useSaveValidation();
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState(MEMBER_ROLE);
	const [inviting, setInviting] = useState(false);

	// Per-row in-flight ids.
	const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
	const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
	const [leaving, setLeaving] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const nameInvalid = nameShowErrors && !orgName.trim();
	const inviteInvalid = inviteShowErrors && !inviteEmail.trim();

	// Org-name save/discard, registered with the container's unified footer.
	// Both callbacks — and the registration hook itself — must run on every
	// render (before the loading early-return below) to satisfy Rules of Hooks.
	// `organization` isn't narrowed non-null yet at this point, so each guards
	// on it directly; that's a no-op in practice since `dirty` can't be true
	// until the form is seeded from a loaded organization.
	const handleSaveName = useCallback(async () => {
		if (!organization || !isAdmin) return;
		markNameAttempt();
		const trimmed = orgName.trim();
		if (!trimmed) return;
		if (trimmed === organization.name) {
			setNameDirty(false);
			clearNameErrors();
			return;
		}
		setSavingName(true);
		try {
			await organization.update({ name: trimmed });
			setNameDirty(false);
			clearNameErrors();
			toast.success("Organization updated", "Your changes have been saved.");
		} catch (error) {
			toast.error("Couldn't update organization", clerkErr(error));
		} finally {
			setSavingName(false);
		}
	}, [organization, isAdmin, orgName, markNameAttempt, clearNameErrors, toast]);

	const handleDiscardName = useCallback(() => {
		if (!organization) return;
		setOrgName(organization.name);
		setNameDirty(false);
		clearNameErrors();
	}, [organization, clearNameErrors]);

	useRegisterSettingsSave({
		dirty: nameDirty,
		saving: savingName,
		canSave: true,
		save: handleSaveName,
		discard: handleDiscardName,
		saveLabel: "Save changes",
	});

	// Per-member access summary for the Access chip + "Manage access" link,
	// joined to Clerk rows by externalId (Clerk user id). Admin-only surface.
	const accessRows = useQuery(
		api.permissions.orgMemberAccess,
		isAdmin ? {} : "skip",
	);
	type AccessRow = NonNullable<typeof accessRows>[number];
	const accessByExternalId = useMemo(() => {
		const map = new Map<string, AccessRow>();
		accessRows?.forEach((row) => map.set(row.externalId, row));
		return map;
	}, [accessRows]);

	const handleRoleChange = async (
		member: MemberRow,
		role: string,
	) => {
		if (member.role === role) return;
		setPendingMemberId(member.id);
		try {
			await member.update({ role });
			await memberships?.revalidate?.();
			toast.success("Role updated", "The member's role has been changed.");
		} catch (error) {
			toast.error("Couldn't update role", clerkErr(error));
		} finally {
			setPendingMemberId(null);
		}
	};

	const handleRemoveMember = async (member: MemberRow) => {
		const confirmed = await confirmDialog({
			title: "Remove member",
			message: `Remove ${memberDisplayName(member) || "this member"} from the organization? They'll lose access immediately.`,
			confirmLabel: "Remove member",
			cancelLabel: "Cancel",
			variant: "destructive",
		});
		if (!confirmed) return;
		setPendingMemberId(member.id);
		try {
			await member.destroy();
			await memberships?.revalidate?.();
			toast.success("Member removed", "They no longer have access.");
		} catch (error) {
			toast.error("Couldn't remove member", clerkErr(error));
		} finally {
			setPendingMemberId(null);
		}
	};

	const members = memberships?.data ?? [];

	const memberColumns = useMemo<ColumnDef<MemberRow>[]>(() => {
		const base: ColumnDef<MemberRow>[] = [
			{
				id: "member",
				accessorFn: (member) => memberDisplayName(member),
				header: "Member",
				cell: ({ row }) => {
					const member = row.original;
					const info = member.publicUserData;
					const name = memberDisplayName(member);
					const email = info?.identifier ?? "";
					const isSelf = member.id === membership?.id;
					return (
						<div className="flex items-center gap-3">
							<Avatar className="size-8">
								{info?.imageUrl ? (
									<AvatarImage src={info.imageUrl} alt="" />
								) : null}
								<AvatarFallback className="text-xs font-medium">
									{getInitials(name, email)}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-col">
								<span className="text-sm font-medium text-foreground">
									{name}
									{isSelf && (
										<span className="font-normal text-muted-foreground">
											{" "}
											(you)
										</span>
									)}
								</span>
								{email && name !== email && (
									<span className="text-xs text-muted-foreground">{email}</span>
								)}
							</div>
						</div>
					);
				},
			},
			{
				id: "role",
				header: "Role",
				cell: ({ row }) => {
					const member = row.original;
					const isSelf = member.id === membership?.id;
					const access = accessByExternalId.get(member.publicUserData?.userId ?? "");
					const isOwnerRow = access?.isOwner ?? false;
					const rowBusy = pendingMemberId === member.id;
					if (isAdmin && !isSelf && !isOwnerRow) {
						return (
							<Select
								value={member.role}
								onValueChange={(value) => {
									if (value) handleRoleChange(member, value);
								}}
								disabled={rowBusy}
							>
								<SelectTrigger size="sm" className="w-28">
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
						);
					}
					if (isOwnerRow) {
						return (
							<Badge variant="primary-light" radius="full" size="lg">
								<Lock className="h-3 w-3" aria-hidden="true" /> Owner
							</Badge>
						);
					}
					return (
						<Badge
							variant={member.role === ADMIN_ROLE ? "primary-light" : "secondary"}
							radius="full"
							size="lg"
						>
							{roleLabel(member.role)}
						</Badge>
					);
				},
			},
		];

		if (!isAdmin) return base;

		return [
			...base,
			{
				id: "access",
				header: "Access",
				cell: ({ row }) => {
					const member = row.original;
					const access = accessByExternalId.get(member.publicUserData?.userId ?? "");
					if (accessRows === undefined) {
						return <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />;
					}
					if (!access) {
						return <span className="text-xs text-muted-foreground">—</span>;
					}
					const label =
						access.isOwner || access.isAdmin
							? "Full access"
							: access.hasCustomPermissions
								? "Custom"
								: "Default";
					return (
						<Badge variant="outline" radius="full" size="lg">
							{label}
						</Badge>
					);
				},
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const member = row.original;
					const isSelf = member.id === membership?.id;
					if (isSelf) return null;
					const rowBusy = pendingMemberId === member.id;
					const access = accessByExternalId.get(member.publicUserData?.userId ?? "");
					const isOwnerRow = access?.isOwner ?? false;
					const convexUserId = access?.userId;
					const name = memberDisplayName(member) || "this member";
					return (
						<div
							className="flex items-center justify-end gap-2"
							onClick={(e) => e.stopPropagation()}
						>
							{!isOwnerRow && convexUserId && (
								<Button
									variant="outline"
									size="icon-sm"
									aria-label={`Manage access for ${name}`}
									onClick={() =>
										router.push(`/organization/profile/members/${convexUserId}`)
									}
								>
									<ShieldCheck className="h-4 w-4" />
								</Button>
							)}
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Remove member"
								disabled={rowBusy}
								onClick={() => handleRemoveMember(member)}
								className="hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
							>
								{rowBusy ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Trash2 className="h-4 w-4" />
								)}
							</Button>
						</div>
					);
				},
			},
		];
	}, [isAdmin, membership?.id, accessByExternalId, accessRows, pendingMemberId, router]);

	const [memberSorting, setMemberSorting] = useState<SortingState>([]);
	const memberTable = useReactTable({
		data: members,
		columns: memberColumns,
		state: { sorting: memberSorting },
		onSortingChange: setMemberSorting,
		getRowId: (member) => member.id,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	if (!isLoaded || !organization) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const handleLogoSelect = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;
		// Logo edits require the Convex owner: setLogo would change the Clerk logo,
		// but the owner-gated organizations.update below keeps the Convex mirror
		// (used by quotes/invoices/previews) in sync — so gate them together.
		if (!isAdmin || !isOwner) {
			event.target.value = "";
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			toast.error("Logo too large", "Choose an image 10 MB or smaller.");
			event.target.value = "";
			return;
		}
		setUploadingLogo(true);
		try {
			const updated = await organization.setLogo({ file });
			// Keep the Convex mirror in sync so quotes/invoices/previews match.
			// The upload is gated to the owner above, so this always applies.
			try {
				await updateOrganization({
					logoUrl: updated.imageUrl ?? organization.imageUrl ?? undefined,
				});
			} catch {
				// Non-fatal: the Clerk logo still updated.
			}
			toast.success("Logo updated", "Your organization logo has been changed.");
		} catch (error) {
			toast.error("Couldn't update logo", clerkErr(error));
		} finally {
			setUploadingLogo(false);
			if (logoInputRef.current) logoInputRef.current.value = "";
		}
	};

	const handleInvite = async () => {
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

	const handleLeave = async () => {
		const confirmed = await confirmDialog({
			title: "Leave organization",
			message:
				"You'll lose access to this organization's data. You can be re-invited later. Continue?",
			confirmLabel: "Leave organization",
			cancelLabel: "Cancel",
			variant: "destructive",
		});
		if (!confirmed) return;
		setLeaving(true);
		try {
			await membership?.destroy();
			await setActive({ organization: null });
			router.push("/organization/complete");
		} catch (error) {
			toast.error("Couldn't leave organization", clerkErr(error));
			setLeaving(false);
		}
	};

	const handleDelete = async () => {
		const confirmed = await confirmDialog({
			title: "Delete organization",
			message:
				"This permanently deletes the organization and all of its data. This cannot be undone.",
			confirmLabel: "Delete organization",
			cancelLabel: "Cancel",
			variant: "destructive",
		});
		if (!confirmed) return;
		setDeleting(true);
		try {
			await deleteOrganization();
			await setActive({ organization: null });
			router.push("/organization/complete");
		} catch (error) {
			// The user dismissed Clerk's step-up modal — not an error worth a toast.
			if (isReverificationCancelledError(error)) {
				setDeleting(false);
				return;
			}
			toast.error("Couldn't delete organization", clerkErr(error));
			setDeleting(false);
		}
	};

	const pendingInvites = (invitations?.data ?? []).filter(
		(invitation) => invitation.status === "pending",
	);
	const orgImageUrl = organization.imageUrl;
	const viewOnlyBadge = !isAdmin ? (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
			<Lock className="h-3 w-3" aria-hidden="true" /> View only
		</span>
	) : undefined;

	return (
		<div className="space-y-8">
			<SectionHeading
				title="Organization"
				description="Manage your organization's profile, team, and invitations."
				aside={viewOnlyBadge}
			/>

			{/* Identity */}
			<Frame>
				<FrameHeader>
					<FrameTitle>Organization</FrameTitle>
					<FrameDescription>
						Your logo and name appear across the app and on client-facing
						documents.
					</FrameDescription>
				</FrameHeader>

				<FramePanel>
					<div className="flex items-center gap-4">
						<Avatar className="size-[60px] rounded-xl ring-1 ring-border/60">
							{orgImageUrl ? (
								<AvatarImage
									src={orgImageUrl}
									alt=""
									className="object-contain"
								/>
							) : null}
							<AvatarFallback className="rounded-xl text-lg font-semibold">
								{getInitials(organization.name)}
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col items-start gap-2">
							<input
								ref={logoInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleLogoSelect}
								disabled={!isAdmin || !isOwner || uploadingLogo}
							/>
							<Button
								variant="outline"
								size="sm"
								onClick={() => logoInputRef.current?.click()}
								disabled={!isAdmin || !isOwner || uploadingLogo}
							>
								{uploadingLogo ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Upload className="h-4 w-4" />
								)}
								{uploadingLogo ? "Uploading…" : "Change logo"}
							</Button>
							<p className="text-xs text-muted-foreground">
								PNG, JPG, or SVG up to 10 MB.
							</p>
						</div>
					</div>

					<div className="mt-6 border-t border-border pt-6">
						<Field data-invalid={nameInvalid || undefined}>
							<FieldLabel htmlFor="org-name">
								Organization name
								<span aria-hidden="true" className="ml-0.5 text-destructive">
									*
								</span>
							</FieldLabel>
							<Input
								id="org-name"
								value={orgName}
								onChange={(event) => {
									setNameDirty(true);
									setOrgName(event.target.value);
								}}
								disabled={!isAdmin || savingName}
								aria-invalid={nameInvalid || undefined}
								placeholder="Acme Cleaning Co."
								autoComplete="organization"
							/>
							{nameInvalid && (
								<FieldError>Organization name is required.</FieldError>
							)}
						</Field>
					</div>
				</FramePanel>

				<FrameFooter>
					<p className="text-xs text-muted-foreground">
						Changes sync across your workspace.
					</p>
				</FrameFooter>
			</Frame>

			{/* Members + invitations */}
			<div
				className={cn(
					"grid items-start gap-6",
					isAdmin && "lg:grid-cols-2",
				)}
			>
				<Frame>
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<div className="flex flex-col gap-0.5">
							<FrameTitle>Team members</FrameTitle>
							<FrameDescription>
								People with access to this organization.
							</FrameDescription>
						</div>
						<Badge
							variant="secondary"
							radius="full"
							size="lg"
							className="shrink-0"
						>
							{memberships?.count ?? members.length}
						</Badge>
					</FrameHeader>

					<DataGrid
						table={memberTable}
						recordCount={members.length}
						emptyMessage="No members yet."
						tableLayout={{ width: "auto", headerBackground: true }}
					>
						<FramePanel className="p-0">
							<div className="overflow-x-auto">
								<DataGridContainer className="rounded-lg border">
									<DataGridTable />
								</DataGridContainer>
							</div>
						</FramePanel>

						{memberships?.hasNextPage && (
							<FrameFooter className="items-center">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => memberships.fetchNext?.()}
									disabled={memberships.isFetching}
								>
									{memberships.isFetching && (
										<Loader2 className="h-4 w-4 animate-spin" />
									)}
									Load more
								</Button>
							</FrameFooter>
						)}
					</DataGrid>
				</Frame>

				{/* Invitations (admins only) */}
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

			{/* Danger zone */}
			<Frame className="border-destructive/30">
				<FrameHeader>
					<FrameTitle className="text-destructive">Danger zone</FrameTitle>
					<FrameDescription>
						Irreversible actions for this organization.
					</FrameDescription>
				</FrameHeader>

				<FramePanel className="border-destructive/20 bg-destructive/[0.03] p-0!">
					<ul className="flex flex-col">
						<li>
							<div className="flex items-center gap-3 px-[22px] py-4">
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<p className="text-sm font-medium text-foreground">
										Leave organization
									</p>
									<p className="text-xs leading-4 text-muted-foreground">
										Remove yourself from this organization. You&apos;ll lose
										access to its data.
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={handleLeave}
									disabled={leaving}
									className="shrink-0 text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
								>
									{leaving ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<LogOut className="h-4 w-4" />
									)}
									Leave
								</Button>
							</div>
							{isAdmin && <Separator className="bg-destructive/20" />}
						</li>

						{isAdmin && (
							<li>
								<div className="flex items-center gap-3 px-[22px] py-4">
									<div className="flex min-w-0 flex-1 flex-col gap-1">
										<p className="text-sm font-medium text-destructive">
											Delete organization
										</p>
										<p className="text-xs leading-4 text-muted-foreground">
											Permanently delete this organization and all of its data.
											This cannot be undone.
										</p>
									</div>
									<Button
										variant="destructive"
										size="sm"
										onClick={handleDelete}
										disabled={deleting}
										className="shrink-0"
									>
										{deleting ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Trash2 className="h-4 w-4" />
										)}
										Delete
									</Button>
								</div>
							</li>
						)}
					</ul>
				</FramePanel>
			</Frame>
		</div>
	);
}

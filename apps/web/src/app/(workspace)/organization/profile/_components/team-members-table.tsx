"use client";

import { useCallback, useMemo, useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
	ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Lock, ShieldCheck, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
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
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { api } from "@onetool/backend/convex/_generated/api";
import {
	ADMIN_ROLE,
	ROLE_OPTIONS,
	MEMBERSHIPS_PARAMS,
	roleLabel,
	getInitials,
	memberDisplayName,
	clerkErr,
} from "../_lib/org-members";

/**
 * Roster of org members. In `readOnly` mode (the Overview summary) roles render
 * as static badges with no remove/manage-access controls; the full Team tab
 * variant lets admins edit roles, remove members, and open the RBAC editor.
 */
export function TeamMembersTable({ readOnly = false }: { readOnly?: boolean }) {
	const router = useRouter();
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const { membership, memberships } = useOrganization(MEMBERSHIPS_PARAMS);

	const isAdmin = membership?.role === ADMIN_ROLE;
	// Admins get management controls, but the summary variant stays read-only.
	const canManage = isAdmin && !readOnly;

	type MemberRow = NonNullable<NonNullable<typeof memberships>["data"]>[number];

	const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

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

	// Wrapped in useCallback (with `memberships` as a dep) so the columns memo
	// below can list them explicitly — this keeps the closed-over `revalidate`
	// current instead of relying on a suppressed exhaustive-deps rule.
	const handleRoleChange = useCallback(
		async (member: MemberRow, role: string) => {
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
		},
		[memberships, toast],
	);

	const handleRemoveMember = useCallback(
		async (member: MemberRow) => {
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
		},
		[memberships, confirmDialog, toast],
	);

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
					const access = accessByExternalId.get(
						member.publicUserData?.userId ?? "",
					);
					const isOwnerRow = access?.isOwner ?? false;
					const rowBusy = pendingMemberId === member.id;
					if (canManage && !isSelf && !isOwnerRow) {
						return (
							<Select
								value={member.role}
								onValueChange={(value) => {
									if (value) handleRoleChange(member, value);
								}}
								disabled={rowBusy}
							>
								<SelectTrigger
									size="sm"
									className="w-28"
									aria-label={`Change role for ${
										memberDisplayName(member) || "this member"
									}`}
								>
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

		const withAccess: ColumnDef<MemberRow>[] = [
			...base,
			{
				id: "access",
				header: "Access",
				cell: ({ row }) => {
					const member = row.original;
					const access = accessByExternalId.get(
						member.publicUserData?.userId ?? "",
					);
					if (accessRows === undefined) {
						return (
							<div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
						);
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
		];

		// The summary (read-only) roster stops here — no remove / manage-access.
		if (!canManage) return withAccess;

		return [
			...withAccess,
			{
				id: "actions",
				header: "",
				cell: ({ row }) => {
					const member = row.original;
					const isSelf = member.id === membership?.id;
					if (isSelf) return null;
					const rowBusy = pendingMemberId === member.id;
					const access = accessByExternalId.get(
						member.publicUserData?.userId ?? "",
					);
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
									size="sm"
									onClick={() =>
										router.push(
											`/organization/profile/members/${convexUserId}`,
										)
									}
								>
									<ShieldCheck className="h-4 w-4" />
									Manage access
								</Button>
							)}
							<Button
								variant="outline"
								size="icon-sm"
								aria-label={`Remove ${name}`}
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
	}, [
		isAdmin,
		canManage,
		membership?.id,
		accessByExternalId,
		accessRows,
		pendingMemberId,
		router,
		handleRoleChange,
		handleRemoveMember,
	]);

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

	return (
		<Frame>
			<FrameHeader className="flex-row items-center justify-between gap-3">
				<div className="flex flex-col gap-0.5">
					<FrameTitle>Team members</FrameTitle>
					<FrameDescription>
						People with access to this organization.
					</FrameDescription>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant="secondary" radius="full" size="lg">
						{memberships?.count ?? members.length}
					</Badge>
					{readOnly && isAdmin && (
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								router.push("/organization/profile?tab=team")
							}
						>
							Manage team
						</Button>
					)}
				</div>
			</FrameHeader>

			<DataGrid
				table={memberTable}
				recordCount={members.length}
				emptyMessage={
					<EmptyState
						illustration="team-members-none"
						title="No members yet"
						description="Invite a teammate to give them access to this workspace."
					/>
				}
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
	);
}

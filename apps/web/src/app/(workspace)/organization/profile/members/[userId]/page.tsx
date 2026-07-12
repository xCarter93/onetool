"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrganization } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useMutation, useQuery } from "convex/react";
import {
	getCoreRowModel,
	useReactTable,
	type ColumnDef,
} from "@tanstack/react-table";
import {
	ArrowLeft,
	CircleCheck,
	Clock,
	Loader2,
	Lock,
	ShieldCheck,
	UserX,
} from "lucide-react";

import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	ACCESS_LEVELS,
	DEFAULT_MEMBER_PERMISSIONS,
	isScopable,
	PERMISSION_OBJECTS,
	type AccessLevel,
	type ObjectGrant,
	type PermissionGrants,
	type PermissionObject,
} from "@onetool/backend/convex/lib/permissionKeys";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/reui/badge";
import { DataGrid } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
	Frame,
	FrameDescription,
	FrameFooter,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { EmptyState } from "@/components/domain/empty-state";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";

const ADMIN_ROLE = "org:admin";
const MEMBER_ROLE = "org:member";

const LEVEL_LABELS: Record<AccessLevel, string> = {
	none: "None",
	view: "View",
	modify: "Modify",
	delete: "Delete",
};

// Display order per PRD §5.3.
const OBJECT_ORDER: PermissionObject[] = [
	"clients",
	"projects",
	"tasks",
	"quotes",
	"invoices",
	"skus",
	"documents",
	"orgDocuments",
	"community",
	"automations",
	"reports",
	"inbox",
	"billing",
];

const OBJECT_META: Record<
	PermissionObject,
	{ label: string; description: string }
> = {
	clients: {
		label: "Clients",
		description: "Client records, contacts, and properties",
	},
	projects: { label: "Projects", description: "Projects and scheduling" },
	tasks: { label: "Tasks", description: "Tasks and assignments" },
	quotes: {
		label: "Quotes",
		description: "Quotes, line items, and e-signatures",
	},
	invoices: {
		label: "Invoices",
		description: "Invoices, line items, and payments",
	},
	skus: { label: "Products & services", description: "The SKU catalog" },
	documents: {
		label: "Documents",
		description: "Files attached to clients and projects",
	},
	orgDocuments: {
		label: "Org documents",
		description: "Organization-wide document library",
	},
	community: { label: "Community", description: "Community pages and posts" },
	automations: {
		label: "Automations",
		description: "Workflow automations and run history",
	},
	reports: { label: "Reports", description: "Saved reports and report data" },
	inbox: { label: "Inbox", description: "Client email threads" },
	billing: {
		label: "Billing",
		description: "Subscription and billing settings",
	},
};

// Short scope hints for the "All records" column when scoped-off.
const SCOPE_HINTS = {
	direct: "Assigned only",
	derived: "Via their projects",
} as const;

// Ownership wording differs where scoping is by creator, not assignment.
const SCOPE_HINT_OVERRIDES: Partial<Record<PermissionObject, string>> = {
	reports: "Created by them",
};

const LEVEL_COLUMNS = ["view", "modify", "delete"] as const;

function levelIndex(level: AccessLevel): number {
	return ACCESS_LEVELS.indexOf(level);
}

function grantFor(
	grants: PermissionGrants,
	object: PermissionObject
): ObjectGrant {
	return grants[object] ?? { level: "none" };
}

/** Full 13-object record the mutation stores (it replaces, not merges). */
function materialize(grants: PermissionGrants): PermissionGrants {
	const out: PermissionGrants = {};
	for (const object of OBJECT_ORDER) {
		const g = grantFor(grants, object);
		out[object] =
			g.allRecords && isScopable(object) && g.level !== "none"
				? { level: g.level, allRecords: true }
				: { level: g.level };
	}
	return out;
}

function sameGrants(a: PermissionGrants, b: PermissionGrants): boolean {
	for (const object of OBJECT_ORDER) {
		const ga = grantFor(a, object);
		const gb = grantFor(b, object);
		if (ga.level !== gb.level) return false;
		if ((ga.allRecords === true) !== (gb.allRecords === true)) return false;
	}
	return true;
}

function clerkErr(err: unknown, fallback = "Something went wrong.") {
	if (isClerkAPIResponseError(err)) {
		return err.errors[0]?.longMessage ?? err.errors[0]?.message ?? fallback;
	}
	return err instanceof Error ? err.message : fallback;
}

type MasterState = "on" | "off" | "mixed";

function masterState(
	grants: PermissionGrants,
	satisfied: (object: PermissionObject, g: ObjectGrant) => boolean
): MasterState {
	let all = true;
	let none = true;
	for (const object of OBJECT_ORDER) {
		if (satisfied(object, grantFor(grants, object))) none = false;
		else all = false;
	}
	return all ? "on" : none ? "off" : "mixed";
}

const scopeSatisfied = (object: PermissionObject, g: ObjectGrant) =>
	!isScopable(object) || g.allRecords === true;

type MatrixRow = { object: PermissionObject };

const MATRIX_ROWS: MatrixRow[] = OBJECT_ORDER.map((object) => ({ object }));

function AccessMatrixTable({
	grants,
	onToggleLevel,
	onToggleAllRecords,
}: {
	grants: PermissionGrants;
	onToggleLevel: (object: PermissionObject, column: AccessLevel) => void;
	onToggleAllRecords: (object: PermissionObject, on: boolean) => void;
}) {
	const columns = useMemo<ColumnDef<MatrixRow>[]>(() => {
		const levelColumns: ColumnDef<MatrixRow>[] = LEVEL_COLUMNS.map(
			(level) => ({
				id: level,
				header: ({ column }) => (
					<DataGridColumnHeader
						column={column}
						title={LEVEL_LABELS[level]}
						className="mx-auto justify-center text-center text-xs font-medium"
					/>
				),
				cell: ({ row }) => {
					const { object } = row.original;
					if (
						levelIndex(PERMISSION_OBJECTS[object].maxLevel) <
						levelIndex(level)
					) {
						return null; // above this area's ceiling (e.g. Community caps at Modify)
					}
					const grant = grantFor(grants, object);
					return (
						<div className="flex items-center justify-center">
							<Switch
								checked={levelIndex(grant.level) >= levelIndex(level)}
								onCheckedChange={() => onToggleLevel(object, level)}
								aria-label={`${OBJECT_META[object].label}: ${LEVEL_LABELS[level]} access`}
							/>
						</div>
					);
				},
				size: 96,
				enableSorting: false,
				meta: {
					headerClassName: "text-center!",
					cellClassName: "text-center!",
				},
			})
		);

		return [
			{
				id: "area",
				header: ({ column }) => (
					<DataGridColumnHeader title="Area" column={column} />
				),
				cell: ({ row }) => {
					const meta = OBJECT_META[row.original.object];
					return (
						<div className="flex min-w-0 flex-col gap-px py-1">
							<div className="truncate text-sm font-medium text-foreground">
								{meta.label}
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{meta.description}
							</div>
						</div>
					);
				},
				size: 280,
				enableSorting: false,
				meta: {
					headerClassName:
						"text-left! [--data-grid-header-cell-ps:var(--frame-panel-header-px)]",
					cellClassName: "[--data-grid-body-cell-ps:var(--frame-panel-px)]",
				},
			},
			...levelColumns,
			{
				id: "allRecords",
				header: ({ column }) => (
					<DataGridColumnHeader
						column={column}
						title="All records"
						className="mx-auto justify-center text-center text-xs font-medium"
					/>
				),
				cell: ({ row }) => {
					const { object } = row.original;
					const scope = PERMISSION_OBJECTS[object].scope;
					if (scope === null) {
						return (
							<div
								className="text-center text-muted-foreground/50"
								aria-hidden="true"
							>
								—
							</div>
						);
					}
					const grant = grantFor(grants, object);
					const active = grant.level !== "none";
					return (
						<div className="flex flex-col items-center gap-0.5">
							<Switch
								checked={grant.allRecords === true}
								disabled={!active}
								onCheckedChange={(checked) =>
									onToggleAllRecords(object, checked === true)
								}
								aria-label={`${OBJECT_META[object].label}: all records`}
							/>
							{active && grant.allRecords !== true ? (
								<span className="text-[11px] leading-4 text-muted-foreground">
									{SCOPE_HINT_OVERRIDES[object] ?? SCOPE_HINTS[scope]}
								</span>
							) : null}
						</div>
					);
				},
				size: 140,
				enableSorting: false,
				meta: {
					headerClassName: "text-center!",
					cellClassName: "text-center!",
				},
			},
		];
	}, [grants, onToggleLevel, onToggleAllRecords]);

	const table = useReactTable({
		data: MATRIX_ROWS,
		columns,
		getRowId: (row) => row.object,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<DataGrid
			table={table}
			recordCount={MATRIX_ROWS.length}
			tableLayout={{ cellBorder: true, dense: true }}
		>
			<DataGridScrollArea>
				<DataGridTable />
			</DataGridScrollArea>
		</DataGrid>
	);
}

export default function MemberAccessPage() {
	const router = useRouter();
	const params = useParams<{ userId: string }>();
	const targetUserId = params.userId as Id<"users">;

	const toast = useToast();
	const { confirm } = useConfirmDialog();
	const { hasFullAccess, isLoading: permsLoading } = usePermissions();

	const target = useQuery(
		api.permissions.memberPermissions,
		hasFullAccess ? { userId: targetUserId } : "skip"
	);
	const setMemberPermissions = useMutation(
		api.permissions.setMemberPermissions
	);

	// Clerk membership powers the role control (member.update syncs our role
	// column via webhook). Small-team product: one page covers the org.
	const { memberships } = useOrganization({ memberships: { pageSize: 100 } });
	const clerkMember = memberships?.data?.find(
		(m) => m.publicUserData?.userId === target?.externalId
	);

	// Draft-and-save (not save-per-toggle): edits accumulate locally, the
	// footer bar commits or discards. null = pristine (mirror the server).
	const [draft, setDraft] = useState<PermissionGrants | null>(null);
	const [saving, setSaving] = useState(false);
	const [rolePending, setRolePending] = useState(false);

	if (permsLoading || (hasFullAccess && target === undefined)) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
			</div>
		);
	}

	if (!hasFullAccess) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center p-6">
				<EmptyState
					size="md"
					icon={<Lock className="h-6 w-6" aria-hidden="true" />}
					title="Admin access required"
					description="Only organization admins can manage member access."
				/>
			</div>
		);
	}

	if (target === null) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center p-6">
				<EmptyState
					size="md"
					icon={<UserX className="h-6 w-6" aria-hidden="true" />}
					title="Member not found"
					description="They may have been removed from the organization."
					action={
						<Button
							variant="outline"
							onClick={() =>
								router.push("/organization/profile?tab=overview")
							}
						>
							Back to organization
						</Button>
					}
				/>
			</div>
		);
	}
	if (!target) return null;

	const displayName = target.name || target.email || "Member";
	const initials = displayName
		.split(/\s+/)
		.map((p) => p[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

	const serverGrants = target.permissions ?? DEFAULT_MEMBER_PERMISSIONS;
	const grants = draft ?? serverGrants;
	const dirty = draft !== null && !sameGrants(draft, serverGrants);

	// Ladder toggle: switching a level ON raises to it; switching OFF drops
	// just below it. All three off = None.
	const handleToggleLevel = (
		object: PermissionObject,
		column: AccessLevel
	) => {
		const current = grantFor(grants, object);
		const on = levelIndex(current.level) >= levelIndex(column);
		const nextLevel: AccessLevel = on
			? ACCESS_LEVELS[levelIndex(column) - 1]
			: column;
		const next: PermissionGrants = { ...grants };
		next[object] =
			nextLevel !== "none" && current.allRecords && isScopable(object)
				? { level: nextLevel, allRecords: true }
				: { level: nextLevel };
		setDraft(next);
	};

	const handleToggleAllRecords = (object: PermissionObject, on: boolean) => {
		const current = grantFor(grants, object);
		const next: PermissionGrants = { ...grants };
		next[object] = on
			? { level: current.level, allRecords: true }
			: { level: current.level };
		setDraft(next);
	};

	// §3.4 master toggles — stateless select-all controls over the matrix.
	const viewState = masterState(
		grants,
		(o, g) => levelIndex(g.level) >= levelIndex("view") && scopeSatisfied(o, g)
	);
	const modifyState = masterState(grants, (o, g) => {
		const cap = Math.min(
			levelIndex("modify"),
			levelIndex(PERMISSION_OBJECTS[o].maxLevel)
		);
		return levelIndex(g.level) >= cap && scopeSatisfied(o, g);
	});
	const deleteState = masterState(
		grants,
		(o, g) => g.level === PERMISSION_OBJECTS[o].maxLevel && scopeSatisfied(o, g)
	);

	const bulkApply = (
		compute: (object: PermissionObject, g: ObjectGrant) => ObjectGrant
	) => {
		const next: PermissionGrants = {};
		for (const object of OBJECT_ORDER) {
			next[object] = compute(object, grantFor(grants, object));
		}
		setDraft(next);
	};

	const handleViewAll = (checked: boolean) =>
		bulkApply((object, g) =>
			checked
				? {
						// Rows above view keep their higher level; scope widens.
						level:
							levelIndex(g.level) > levelIndex("view") ? g.level : "view",
						...(isScopable(object) ? { allRecords: true } : {}),
					}
				: { level: "none" }
		);

	const handleModifyAll = (checked: boolean) =>
		bulkApply((object, g) => {
			const cap = PERMISSION_OBJECTS[object].maxLevel;
			const modifyLevel: AccessLevel =
				levelIndex("modify") <= levelIndex(cap) ? "modify" : cap;
			if (checked) {
				return {
					level: modifyLevel,
					...(isScopable(object) ? { allRecords: true } : {}),
				};
			}
			// Off: dial rows at/above modify back down to view.
			return levelIndex(g.level) >= levelIndex(modifyLevel)
				? {
						level: "view",
						...(g.allRecords && isScopable(object)
							? { allRecords: true }
							: {}),
					}
				: g;
		});

	const handleDeleteAll = async (checked: boolean) => {
		if (checked) {
			const confirmed = await confirm({
				title: "Grant full data access?",
				message: `${displayName} will be able to view, modify, and delete every record in the organization — effectively admin-level data access without the admin role.`,
				confirmLabel: "Grant full access",
				variant: "warning",
			});
			if (!confirmed) return;
			bulkApply((object) => ({
				level: PERMISSION_OBJECTS[object].maxLevel,
				...(isScopable(object) ? { allRecords: true } : {}),
			}));
			return;
		}
		// Off: dial max-level rows back down to modify (capped).
		bulkApply((object, g) => {
			const cap = PERMISSION_OBJECTS[object].maxLevel;
			if (g.level !== cap) return g;
			const modifyLevel: AccessLevel =
				levelIndex("modify") <= levelIndex(cap) ? "modify" : cap;
			return {
				level: modifyLevel,
				...(g.allRecords && isScopable(object) ? { allRecords: true } : {}),
			};
		});
	};

	const handleSave = async () => {
		if (!dirty || saving) return;
		setSaving(true);
		try {
			await setMemberPermissions({
				userId: target.userId,
				permissions: materialize(grants),
			});
			setDraft(null);
			toast.success(
				"Access updated",
				`${displayName}'s access takes effect immediately.`
			);
		} catch (error) {
			toast.error(
				"Couldn't update access",
				error instanceof Error ? error.message : "Please try again."
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDiscard = () => setDraft(null);

	const handleRoleChange = async (nextRole: string) => {
		if (!clerkMember || clerkMember.role === nextRole) return;
		// Client-side last-admin guard (§3.6); Clerk-side errors surface via toast.
		if (nextRole === MEMBER_ROLE) {
			const adminCount =
				memberships?.data?.filter((m) =>
					m.role.toLowerCase().includes("admin")
				).length ?? 0;
			if (adminCount <= 1) {
				toast.error(
					"Organization needs an admin",
					"Promote another member to admin before demoting this one."
				);
				return;
			}
		}
		setRolePending(true);
		try {
			await clerkMember.update({ role: nextRole });
			await memberships?.revalidate?.();
			toast.success("Role updated", "The member's role has been changed.");
		} catch (error) {
			toast.error("Couldn't update role", clerkErr(error));
		} finally {
			setRolePending(false);
		}
	};

	const currentRole = clerkMember?.role ?? target.role ?? MEMBER_ROLE;
	const roleValue = currentRole.toLowerCase().includes("admin")
		? ADMIN_ROLE
		: MEMBER_ROLE;

	return (
		<div className="relative space-y-6 px-6 pt-8 pb-6">
			<div>
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 text-muted-foreground"
					onClick={() => router.push("/organization/profile?tab=overview")}
				>
					<ArrowLeft className="h-4 w-4" aria-hidden="true" />
					Organization settings
				</Button>
			</div>

			<Frame>
				<FramePanel>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<Avatar className="size-11">
								{target.image ? (
									<AvatarImage src={target.image} alt="" />
								) : null}
								<AvatarFallback>{initials}</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<h1 className="truncate text-base font-semibold">
									{displayName}
								</h1>
								{target.email ? (
									<p className="truncate text-sm text-muted-foreground">
										{target.email}
									</p>
								) : null}
							</div>
						</div>
						{target.isOwner ? (
							<Badge variant="secondary" className="w-fit gap-1.5">
								<Lock className="h-3 w-3" aria-hidden="true" />
								Owner
							</Badge>
						) : (
							<div className="flex items-center gap-2">
								{rolePending ? (
									<Loader2
										className="h-4 w-4 animate-spin text-muted-foreground"
										aria-hidden="true"
									/>
								) : null}
								<SegmentedControl
									value={roleValue}
									onValueChange={(value) => void handleRoleChange(value)}
									options={[
										{ value: MEMBER_ROLE, label: "Member" },
										{ value: ADMIN_ROLE, label: "Admin" },
									]}
								/>
							</div>
						)}
					</div>
				</FramePanel>
			</Frame>

			{target.isAdmin ? (
				<Frame>
					<FramePanel>
						<div className="flex items-start gap-3">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
								<ShieldCheck
									className="size-4.5 text-primary"
									aria-hidden="true"
								/>
							</div>
							<div>
								<h2 className="text-sm font-medium">
									{target.isOwner ? "Owners" : "Admins"} have full access
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									{target.isOwner
										? "The owner's access can't be changed."
										: "All data and settings are available to admins. Switch the role to Member to customize what they can see and do — their saved custom access will apply again."}
								</p>
							</div>
						</div>
					</FramePanel>
				</Frame>
			) : (
				<Frame stacked>
					<FrameHeader className="flex-row items-center justify-between gap-3">
						<div className="flex flex-col gap-px">
							<FrameTitle>Access</FrameTitle>
							<FrameDescription>
								Each level includes the ones before it. Changes apply when
								saved.
							</FrameDescription>
						</div>
					</FrameHeader>
					<FramePanel className="p-0!">
						<div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-5">
							<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Presets
							</span>
							<MasterToggle
								id="master-view"
								label="View all data"
								state={viewState}
								onChange={handleViewAll}
							/>
							<MasterToggle
								id="master-modify"
								label="Modify all data"
								state={modifyState}
								onChange={handleModifyAll}
							/>
							<MasterToggle
								id="master-delete"
								label="Delete all data"
								state={deleteState}
								onChange={(checked) => void handleDeleteAll(checked)}
							/>
						</div>

						<Separator />

						<AccessMatrixTable
							grants={grants}
							onToggleLevel={handleToggleLevel}
							onToggleAllRecords={handleToggleAllRecords}
						/>
					</FramePanel>
					<FrameFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
							<Badge variant={dirty ? "warning-light" : "success-light"}>
								{dirty ? (
									<Clock className="size-3" aria-hidden="true" />
								) : (
									<CircleCheck className="size-3" aria-hidden="true" />
								)}
								{dirty ? "Unsaved" : "Saved"}
							</Badge>
							<span className="truncate">
								{dirty ? "Access changes pending" : "All changes saved"}
							</span>
						</div>
						<div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
							<Button
								type="button"
								variant="ghost"
								onClick={handleDiscard}
								disabled={!dirty || saving}
								className="w-full sm:w-auto"
							>
								Discard
							</Button>
							<Button
								type="button"
								onClick={() => void handleSave()}
								disabled={!dirty || saving}
								className="w-full sm:w-auto"
							>
								{saving ? (
									<Loader2
										className="size-4 animate-spin"
										aria-hidden="true"
									/>
								) : null}
								Save changes
							</Button>
						</div>
					</FrameFooter>
				</Frame>
			)}
		</div>
	);
}

function MasterToggle({
	id,
	label,
	state,
	onChange,
}: {
	id: string;
	label: string;
	state: MasterState;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label
			htmlFor={id}
			className="flex cursor-pointer items-center gap-2 text-sm font-medium"
		>
			<Checkbox
				id={id}
				checked={state === "on"}
				indeterminate={state === "mixed"}
				onCheckedChange={(checked) => onChange(checked === true)}
			/>
			{label}
		</label>
	);
}

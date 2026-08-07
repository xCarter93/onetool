"use client";

import { useCallback, useRef, useState } from "react";
import {
	useOrganization,
	useClerk,
	useReverification,
	useUser,
} from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { Lock, Upload, Trash2, LogOut, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
	Avatar,
	AvatarImage,
	AvatarFallback,
} from "@/components/ui/avatar";
import {
	Frame,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FramePanel,
	FrameFooter,
} from "@/components/reui/frame";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { api } from "@onetool/backend/convex/_generated/api";
import { useOrgOwner } from "../_hooks/use-org-owner";
import { useSaveValidation } from "../_hooks/use-save-validation";
import { useRegisterSettingsSave } from "../_hooks/use-settings-save";
import { SectionHeading } from "./settings-card";
import { TeamMembersTable } from "./team-members-table";
import { ADMIN_ROLE, getInitials, clerkErr } from "../_lib/org-members";

// Formats Clerk's setLogo accepts (SVG is not one of them).
const SUPPORTED_LOGO_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
]);

export function OverviewTab() {
	const router = useRouter();
	const toast = useToast();
	const { confirm: confirmDialog } = useConfirmDialog();
	const { setActive } = useClerk();
	const { isOwner } = useOrgOwner();
	const updateOrganization = useMutation(api.organizations.update);

	const { organization, membership, isLoaded } = useOrganization();
	const { user } = useUser();

	const isAdmin = membership?.role === ADMIN_ROLE;

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

	const [leaving, setLeaving] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const nameInvalid = nameShowErrors && !orgName.trim();

	// Org-name save/discard, registered with the container's unified footer.
	// Both callbacks — and the registration hook itself — must run on every
	// render (before the loading early-return below) to satisfy Rules of Hooks.
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
		// Clerk's setLogo rejects SVGs (and other exotic types); catch them here
		// instead of at upload time. The accept attr filters the picker but not
		// drag-drop or "All Files" selections.
		if (!SUPPORTED_LOGO_TYPES.has(file.type)) {
			toast.error(
				"Unsupported logo format",
				"Choose a PNG, JPG, or WEBP image instead.",
			);
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

	// After leaving/deleting the active org, land the user somewhere sane:
	// activate another org they belong to when one exists; only fall back to
	// the create-org flow when none remain. Without this, users with other
	// orgs get trapped on /organization/complete (no switcher, no sign-out).
	const switchToRemainingOrg = async (deletedOrgId: string) => {
		try {
			// Imperative fetch so we get a fresh list; the deleted org can linger
			// in Clerk's client cache, so filter it out explicitly.
			const { data } = (await user?.getOrganizationMemberships({
				pageSize: 50,
			})) ?? { data: [] };
			const next = data.find((m) => m.organization.id !== deletedOrgId);
			if (next) {
				await setActive({ organization: next.organization.id });
				// Middleware routes "/" by role: admins → /home, members → /projects.
				router.push("/");
				return;
			}
		} catch {
			// Fall through to the no-org flow.
		}
		await setActive({ organization: null });
		router.push("/organization/complete");
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
			await switchToRemainingOrg(organization.id);
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
			await switchToRemainingOrg(organization.id);
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
				description="Manage your organization's profile and branding."
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
								accept="image/png,image/jpeg,image/webp"
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
								PNG, JPG, or WEBP up to 10 MB.
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

			{/* Team roster (read-only summary; full management lives on the Team tab) */}
			<TeamMembersTable readOnly />

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

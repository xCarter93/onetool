"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { ImageIcon, Loader2, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionShell } from "./section-shell";
import {
	MAX_TEAM_BIO_LENGTH,
	MAX_TEAM_MEMBERS,
	MAX_TEAM_NAME_LENGTH,
	MAX_TEAM_ROLE_LENGTH,
	type TeamMember,
} from "../use-community-page-form";

interface TeamSectionProps {
	teamMembers: TeamMember[];
	setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
	uploadTeamPhoto: (file: File, index: number) => Promise<void>;
	uploadingTeamPhotoAt: number | null;
	sectionRef: (el: HTMLElement | null) => void;
}

export const TeamSection = React.memo(function TeamSection({
	teamMembers,
	setTeamMembers,
	uploadTeamPhoto,
	uploadingTeamPhotoAt,
	sectionRef,
}: TeamSectionProps) {
	// One input per row: a shared input would need the index threaded through a
	// ref anyway, and this keeps the file dialog tied to the row that opened it.
	const photoInputRefs = useRef<Array<HTMLInputElement | null>>([]);

	const update = (index: number, patch: Partial<TeamMember>) => {
		setTeamMembers((prev) =>
			prev.map((member, i) => (i === index ? { ...member, ...patch } : member)),
		);
	};

	return (
		<SectionShell
			id="team"
			sectionRef={sectionRef}
			icon={Users}
			title="Team"
			description="Names and faces make a stranger comfortable letting you into their home."
			contentClassName="space-y-6 pb-12"
			headerAccessory={
				teamMembers.length > 0 ? (
					<span className="shrink-0 text-xs tabular-nums text-muted-fg">
						{teamMembers.length} of {MAX_TEAM_MEMBERS}
					</span>
				) : undefined
			}
		>
			{teamMembers.length === 0 && (
				<p className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-fg">
					Nobody added yet. Start with whoever turns up at the door.
				</p>
			)}

			<div className="space-y-4">
				{teamMembers.map((member, index) => (
					<div
						key={index}
						className="overflow-hidden rounded-xl border border-border/60 bg-background transition-colors hover:border-border"
					>
						<div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-3">
							<div className="flex min-w-0 items-center gap-3">
								<span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
									{index + 1}
								</span>
								<span className="truncate text-sm font-medium text-fg">
									{member.name || "Unnamed"}
								</span>
							</div>
							<button
								type="button"
								aria-label={`Remove team member ${index + 1}`}
								onClick={() =>
									setTeamMembers((prev) => prev.filter((_, i) => i !== index))
								}
								className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							>
								<Trash2 className="size-4" />
							</button>
						</div>

						<div className="flex flex-col gap-4 p-4 sm:flex-row">
							<div className="flex shrink-0 flex-col items-center gap-2">
								<button
									type="button"
									onClick={() => photoInputRefs.current[index]?.click()}
									aria-label={
										member.photoStorageId
											? `Replace photo for team member ${index + 1}`
											: `Add a photo for team member ${index + 1}`
									}
									className="relative size-20 overflow-hidden rounded-full border border-dashed border-border bg-muted/20 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
								>
									{uploadingTeamPhotoAt === index ? (
										<span className="absolute inset-0 grid place-items-center text-muted-fg">
											<Loader2 className="size-5 animate-spin" />
										</span>
									) : member.photoUrl ? (
										<Image
											src={member.photoUrl}
											alt=""
											fill
											sizes="80px"
											className="object-cover"
										/>
									) : (
										<span className="absolute inset-0 grid place-items-center text-muted-fg">
											<ImageIcon className="size-5 opacity-70" />
										</span>
									)}
								</button>
								{member.photoStorageId && (
									<button
										type="button"
										onClick={() =>
											update(index, {
												photoStorageId: undefined,
												photoUrl: null,
											})
										}
										className="cursor-pointer text-xs text-muted-fg underline-offset-2 hover:text-danger hover:underline"
									>
										Remove photo
									</button>
								)}
								<input
									ref={(el) => {
										photoInputRefs.current[index] = el;
									}}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) void uploadTeamPhoto(file, index);
										e.target.value = "";
									}}
								/>
							</div>

							<div className="min-w-0 flex-1 space-y-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<Field>
										<FieldLabel
											htmlFor={`team-${index}-name`}
											className="text-xs uppercase tracking-wider text-muted-fg"
										>
											Name
										</FieldLabel>
										<Input
											id={`team-${index}-name`}
											value={member.name}
											maxLength={MAX_TEAM_NAME_LENGTH}
											onChange={(e) => update(index, { name: e.target.value })}
											placeholder="Dana Reyes"
										/>
									</Field>
									<Field>
										<FieldLabel
											htmlFor={`team-${index}-role`}
											className="text-xs uppercase tracking-wider text-muted-fg"
										>
											Role
										</FieldLabel>
										<Input
											id={`team-${index}-role`}
											value={member.role}
											maxLength={MAX_TEAM_ROLE_LENGTH}
											onChange={(e) => update(index, { role: e.target.value })}
											placeholder="Crew lead"
										/>
									</Field>
								</div>
								<Field>
									<FieldLabel
										htmlFor={`team-${index}-bio`}
										className="text-xs uppercase tracking-wider text-muted-fg"
									>
										Short bio
									</FieldLabel>
									<Textarea
										id={`team-${index}-bio`}
										value={member.bio}
										maxLength={MAX_TEAM_BIO_LENGTH}
										rows={2}
										onChange={(e) => update(index, { bio: e.target.value })}
										placeholder="Twelve years on the North Shore. Knows every irrigation system in Beverly."
									/>
								</Field>
							</div>
						</div>
					</div>
				))}
			</div>

			<Button
				variant="outline"
				onClick={() =>
					setTeamMembers((prev) => [...prev, { name: "", role: "", bio: "" }])
				}
				disabled={teamMembers.length >= MAX_TEAM_MEMBERS}
			>
				<Plus className="mr-2 size-4" />
				Add someone
			</Button>
		</SectionShell>
	);
});

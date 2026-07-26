import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type OrgUser = Doc<"users">;

export function userInitials(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]!.toUpperCase())
			.join("") || "?"
	);
}

/** Overlapping assignee avatars for event chips and the detail sheet. */
export function AssigneeStack({
	ids,
	usersById,
	max = 3,
	size = "size-5",
}: {
	ids: Id<"users">[];
	usersById: Map<Id<"users">, OrgUser>;
	max?: number;
	size?: string;
}) {
	// Resolve first so the "+N" overflow always matches the avatars actually
	// rendered (unknown ids would otherwise inflate the count).
	const resolved = ids
		.map((id) => usersById.get(id))
		.filter((user): user is OrgUser => Boolean(user));
	const shown = resolved.slice(0, max);
	const extra = resolved.length - shown.length;
	return (
		<AvatarGroup>
			{shown.map((user) => (
				<Avatar key={user._id} className={size}>
					<AvatarImage src={user.image} alt="" loading="lazy" />
					<AvatarFallback className="text-[8px]">
						{userInitials(user.name)}
					</AvatarFallback>
				</Avatar>
			))}
			{extra > 0 && (
				<AvatarGroupCount
					className={cn(
						"bg-muted text-muted-foreground text-[10px] font-medium",
						size
					)}
				>
					+{extra}
				</AvatarGroupCount>
			)}
		</AvatarGroup>
	);
}

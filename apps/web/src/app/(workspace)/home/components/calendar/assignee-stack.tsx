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
	const shown = ids.slice(0, max);
	const extra = ids.length - shown.length;
	return (
		<AvatarGroup>
			{shown.map((id) => {
				const user = usersById.get(id);
				if (!user) return null;
				return (
					<Avatar key={id} className={size}>
						<AvatarImage src={user.image} alt="" loading="lazy" />
						<AvatarFallback className="text-[8px]">
							{userInitials(user.name)}
						</AvatarFallback>
					</Avatar>
				);
			})}
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

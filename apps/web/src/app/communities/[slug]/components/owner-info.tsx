import { cn } from "@/lib/utils";

interface OwnerInfoProps {
	ownerInfo: { name?: string; title?: string } | undefined;
	bannerUrl: string | null;
}

export function OwnerInfo({ ownerInfo, bannerUrl }: OwnerInfoProps) {
	if (!ownerInfo) return null;
	if (!ownerInfo.name && !ownerInfo.title) return null;

	return (
		<p
			className={cn(
				"text-sm",
				bannerUrl ? "text-gray-200" : "text-muted-fg"
			)}
		>
			{ownerInfo.name}
			{ownerInfo.name && ownerInfo.title ? ", " : ""}
			{ownerInfo.title}
		</p>
	);
}

interface OwnerInfoProps {
	ownerInfo: { name?: string; title?: string } | undefined;
}

export function OwnerInfo({ ownerInfo }: OwnerInfoProps) {
	if (!ownerInfo) return null;
	if (!ownerInfo.name && !ownerInfo.title) return null;

	return (
		<p className="text-sm text-muted-fg">
			{ownerInfo.name}
			{ownerInfo.name && ownerInfo.title ? ", " : ""}
			{ownerInfo.title}
		</p>
	);
}

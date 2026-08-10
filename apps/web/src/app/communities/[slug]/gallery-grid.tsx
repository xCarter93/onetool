import Image from "next/image";

interface GalleryImage {
	storageId: string;
	sortOrder: number;
	url: string;
}

interface GalleryGridProps {
	images: GalleryImage[];
	businessName?: string;
	headingClassName?: string;
}

/**
 * The gallery when every photo should be visible at once. The carousel asks a
 * visitor to wait for the next slide; a business whose work is the pitch would
 * rather they saw all of it on the way past.
 */
export function GalleryGrid({
	images,
	businessName,
	headingClassName,
}: GalleryGridProps) {
	if (images.length === 0) return null;

	const altText = businessName
		? `Work by ${businessName}`
		: "Example of our work";

	return (
		<section className="space-y-4">
			<h2 className={headingClassName ?? "text-2xl font-semibold text-foreground"}>
				Our work
			</h2>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
				{images.map((item, index) => (
					<li
						key={item.storageId}
						className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-muted/20"
					>
						<Image
							src={item.url}
							alt={`${altText} — photo ${index + 1} of ${images.length}`}
							fill
							sizes="(min-width: 640px) 33vw, 50vw"
							className="object-cover"
						/>
					</li>
				))}
			</ul>
		</section>
	);
}

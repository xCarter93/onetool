import { ImageIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaPlaceholderProps {
	media: "image" | "video";
	caption: string;
	className?: string;
}

/**
 * Placeholder frame for a screenshot or video that has not been produced yet.
 * Swapping in real media later only requires replacing this component's frame
 * contents; the caption stays.
 */
export function MediaPlaceholder({
	media,
	caption,
	className,
}: MediaPlaceholderProps) {
	const Icon = media === "video" ? PlayIcon : ImageIcon;
	return (
		<figure className={cn("my-8", className)}>
			<div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
				<div
					aria-hidden="true"
					className="absolute inset-0 opacity-50 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]"
				/>
				<div className="relative flex flex-col items-center gap-2.5">
					<span className="flex size-11 items-center justify-center rounded-xl border border-border bg-background shadow-xs">
						<Icon
							className="size-5 text-muted-foreground"
							aria-hidden="true"
						/>
					</span>
					<span className="text-xs font-medium text-muted-foreground">
						{media === "video" ? "Video coming soon" : "Screenshot coming soon"}
					</span>
				</div>
			</div>
			<figcaption className="mt-3 text-center text-sm text-muted-foreground">
				{caption}
			</figcaption>
		</figure>
	);
}

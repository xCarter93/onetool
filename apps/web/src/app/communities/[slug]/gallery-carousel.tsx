"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

interface GalleryImage {
	storageId: string;
	sortOrder: number;
	url: string;
}

interface GalleryCarouselProps {
	images: GalleryImage[];
	businessName?: string;
	headingClassName?: string;
}

export function GalleryCarousel({
	images,
	businessName,
	headingClassName,
}: GalleryCarouselProps) {
	const [activeSlide, setActiveSlide] = useState(0);
	const prefersReducedMotion = usePrefersReducedMotion();
	const [isHovered, setIsHovered] = useState(false);
	const [isFocused, setIsFocused] = useState(false);

	const isPaused = isHovered || isFocused;

	useEffect(() => {
		if (images.length <= 1 || prefersReducedMotion || isPaused) return;
		const timer = setInterval(() => {
			setActiveSlide((prev) => (prev + 1) % images.length);
		}, 4500);
		return () => clearInterval(timer);
	}, [images.length, prefersReducedMotion, isPaused]);

	// Clamp out-of-range slide during render when the image set shrinks.
	if (activeSlide !== 0 && activeSlide >= images.length) {
		setActiveSlide(0);
	}

	if (images.length === 0) return null;

	const altText = businessName
		? `Work by ${businessName}`
		: "Example of our work";

	return (
		<section
			className="space-y-4"
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
			onFocus={() => setIsFocused(true)}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					setIsFocused(false);
				}
			}}
		>
			<div className="flex items-center justify-between gap-4">
				<h2 className={headingClassName ?? "text-2xl font-semibold text-fg"}>
					Our work
				</h2>
				{images.length > 1 && (
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() =>
								setActiveSlide(
									(prev) =>
										(prev - 1 + images.length) % images.length
								)
							}
							aria-label="Previous photo"
							className="size-11"
						>
							<ChevronLeft className="size-4" aria-hidden="true" />
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() =>
								setActiveSlide((prev) => (prev + 1) % images.length)
							}
							aria-label="Next photo"
							className="size-11"
						>
							<ChevronRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				)}
			</div>
			<div className="relative rounded-2xl overflow-hidden border border-border/60 bg-muted/20 aspect-[16/10]">
				{images[activeSlide] && (
					<Image
						src={images[activeSlide].url}
						alt={altText}
						fill
						className="object-cover"
					/>
				)}
			</div>
			{images.length > 1 && (
				<div className="flex items-center justify-center gap-2">
					{images.map((item, index) => (
						<button
							type="button"
							key={item.storageId}
							onClick={() => setActiveSlide(index)}
							className="group grid h-11 w-8 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							aria-label={`Go to photo ${index + 1} of ${images.length}`}
							aria-current={index === activeSlide ? "true" : undefined}
						>
							<span
								aria-hidden="true"
								className={cn(
									"h-2 w-6 origin-center rounded-full transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
									index === activeSlide
										? "scale-x-100 bg-primary"
										: "scale-x-[0.333] bg-muted-fg/40 group-hover:bg-muted-fg/70"
								)}
							/>
						</button>
					))}
				</div>
			)}
		</section>
	);
}

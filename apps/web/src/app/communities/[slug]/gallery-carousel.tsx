"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { cn } from "@/lib/utils";

interface GalleryImage {
	storageId: string;
	sortOrder: number;
	url: string;
}

interface GalleryCarouselProps {
	images: GalleryImage[];
}

export function GalleryCarousel({ images }: GalleryCarouselProps) {
	const [activeSlide, setActiveSlide] = useState(0);

	useEffect(() => {
		if (images.length <= 1) return;
		const timer = setInterval(() => {
			setActiveSlide((prev) => (prev + 1) % images.length);
		}, 4500);
		return () => clearInterval(timer);
	}, [images.length]);

	useEffect(() => {
		if (images.length === 0) {
			setActiveSlide(0);
		} else if (activeSlide >= images.length) {
			setActiveSlide(0);
		}
	}, [images.length, activeSlide]);

	if (images.length === 0) return null;

	return (
		<section className="space-y-4">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-2xl font-semibold text-fg">Image Gallery</h2>
				{images.length > 1 && (
					<div className="flex items-center gap-2">
						<StyledButton
							intent="secondary"
							size="sm"
							onClick={() =>
								setActiveSlide(
									(prev) =>
										(prev - 1 + images.length) % images.length
								)
							}
						>
							<ChevronLeft className="size-4" />
						</StyledButton>
						<StyledButton
							intent="secondary"
							size="sm"
							onClick={() =>
								setActiveSlide((prev) => (prev + 1) % images.length)
							}
						>
							<ChevronRight className="size-4" />
						</StyledButton>
					</div>
				)}
			</div>
			<div className="relative rounded-2xl overflow-hidden border border-border/60 bg-muted/20 aspect-[16/10]">
				{images[activeSlide] && (
					<Image
						src={images[activeSlide].url}
						alt={`Gallery image ${activeSlide + 1}`}
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
							className={cn(
								"h-2 rounded-full transition-all",
								index === activeSlide
									? "w-6 bg-primary"
									: "w-2 bg-muted-fg/40 hover:bg-muted-fg/70"
							)}
							aria-label={`Go to gallery image ${index + 1}`}
						/>
					))}
				</div>
			)}
		</section>
	);
}

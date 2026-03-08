"use client";

import { useRef, useEffect, useState, useCallback } from "react";

const HEADLINE_TEXT =
	"From client management to invoicing, OneTool provides the tools small business owners need to streamline operations, deliver exceptional work, and grow their business with confidence.";

export default function BlurInHeadline() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [wordStates, setWordStates] = useState<number[]>([]);
	const words = HEADLINE_TEXT.split(" ");

	const updateWords = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;

		const rect = container.getBoundingClientRect();
		const viewportHeight = window.innerHeight;

		// Calculate how far into view the element is (0 = just entering, 1 = fully visible)
		const start = viewportHeight;
		const end = viewportHeight * 0.3;
		const progress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)));

		const newStates = words.map((_, i) => {
			const wordProgress = i / words.length;
			const wordVisibility = Math.max(
				0,
				Math.min(1, (progress - wordProgress * 0.7) / 0.3)
			);
			return wordVisibility;
		});

		setWordStates(newStates);
	}, [words.length]);

	useEffect(() => {
		let rafId: number;

		const onScroll = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(updateWords);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		updateWords(); // Initial check

		return () => {
			window.removeEventListener("scroll", onScroll);
			cancelAnimationFrame(rafId);
		};
	}, [updateWords]);

	return (
		<section className="pt-24 pb-12 sm:pt-32 sm:pb-16 lg:pt-40 lg:pb-20 px-4 sm:px-6 lg:px-8">
			<div ref={containerRef} className="max-w-5xl mx-auto">
				<p className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-semibold leading-snug tracking-tight text-center">
					{words.map((word, i) => {
						const visibility = wordStates[i] ?? 0;
						return (
							<span
								key={i}
								className="inline-block mr-[0.3em] transition-none"
								style={{
									opacity: 0.15 + visibility * 0.85,
									filter: `blur(${(1 - visibility) * 8}px)`,
								}}
							>
								{word}
							</span>
						);
					})}
				</p>
			</div>
		</section>
	);
}

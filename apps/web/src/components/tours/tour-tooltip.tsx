"use client";

import {
	useState,
	useCallback,
	useMemo,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X, Keyboard } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";

// Subscribe to viewport size so positioning stays pure and SSR-safe
function subscribeViewport(callback: () => void) {
	window.addEventListener("resize", callback);
	return () => window.removeEventListener("resize", callback);
}
function getViewportSnapshot() {
	return `${window.innerWidth}x${window.innerHeight}`;
}
function getViewportServerSnapshot() {
	return null;
}

interface TourTooltipProps {
	title: string;
	description: string;
	currentStep: number;
	totalSteps: number;
	onNext: () => void;
	onPrev: () => void;
	onSkip: () => void;
	position?: "top" | "bottom" | "left" | "right";
	isFirstStep: boolean;
	isLastStep: boolean;
	targetRect?: DOMRect | null;
}

export function TourTooltip({
	title,
	description,
	currentStep,
	totalSteps,
	onNext,
	onPrev,
	onSkip,
	position = "bottom",
	isFirstStep,
	isLastStep,
	targetRect,
}: TourTooltipProps) {
	const [tooltipDimensions, setTooltipDimensions] = useState({
		width: 320,
		height: 280,
	});

	// null during SSR/first render; viewport string ("WxH") on the client
	const viewport = useSyncExternalStore(
		subscribeViewport,
		getViewportSnapshot,
		getViewportServerSnapshot
	);
	const mounted = viewport !== null;

	// Use callback ref to measure tooltip when it mounts
	const tooltipRef = useCallback((node: HTMLDivElement | null) => {
		if (node) {
			const rect = node.getBoundingClientRect();
			setTooltipDimensions({
				width: rect.width || 320,
				height: rect.height || 280,
			});
		}
	}, []);

	// Calculate tooltip position to stay within viewport
	const tooltipStyle = useMemo<React.CSSProperties>(() => {
		if (!targetRect || !viewport) return {};

		const tooltipWidth = tooltipDimensions.width;
		const tooltipHeight = tooltipDimensions.height;

		const [viewportWidth, viewportHeight] = viewport.split("x").map(Number);
		const padding = 16; // Padding from viewport edges
		const highlightBorder = 6; // Tour element border extension
		const gap = 36; // Gap between tooltip and target (including highlight border)

		let left = 0;
		let top = 0;

		// Calculate position based on preferred position
		// Account for the highlight border that extends 6px beyond the element
		const calculatePosition = (pos: string) => {
			switch (pos) {
				case "right":
					return {
						left: targetRect.right + gap + highlightBorder,
						top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
					};
				case "left":
					return {
						left: targetRect.left - tooltipWidth - gap - highlightBorder,
						top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
					};
				case "top":
					return {
						left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
						top: targetRect.top - tooltipHeight - gap - highlightBorder,
					};
				case "bottom":
				default:
					return {
						left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
						top: targetRect.bottom + gap + highlightBorder,
					};
			}
		};

		// Try preferred position first
		let pos = calculatePosition(position);
		left = pos.left;
		top = pos.top;

		// Check if tooltip fits in viewport, if not try other positions
		const fitsInViewport = (l: number, t: number) => {
			return (
				l >= padding &&
				l + tooltipWidth <= viewportWidth - padding &&
				t >= padding &&
				t + tooltipHeight <= viewportHeight - padding
			);
		};

		if (!fitsInViewport(left, top)) {
			// Try alternative positions in order of preference
			const alternatives =
				position === "right" || position === "left"
					? ["right", "left", "bottom", "top"]
					: ["bottom", "top", "right", "left"];

			for (const alt of alternatives) {
				pos = calculatePosition(alt);
				if (fitsInViewport(pos.left, pos.top)) {
					left = pos.left;
					top = pos.top;
					break;
				}
			}
		}

		// Final clamp to ensure tooltip stays in viewport
		left = Math.max(
			padding,
			Math.min(left, viewportWidth - tooltipWidth - padding)
		);
		top = Math.max(
			padding,
			Math.min(top, viewportHeight - tooltipHeight - padding)
		);

		return {
			position: "fixed",
			left: `${left}px`,
			top: `${top}px`,
			zIndex: 10000,
		};
	}, [targetRect, position, viewport, tooltipDimensions]);

	const tooltipContent = (
		<motion.div
			ref={tooltipRef}
			className="tour-tooltip w-80 max-w-[calc(100vw-2rem)]"
			style={tooltipStyle}
			initial={{ opacity: 0, scale: 0.9 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.9 }}
			transition={{ type: "spring", damping: 25, stiffness: 300 }}
		>
			{/* Tooltip content */}
			<div
				className={cn(
					"relative rounded-xl shadow-2xl overflow-hidden",
					"bg-white dark:bg-gray-800",
					"border border-gray-200 dark:border-gray-700",
					"ring-1 ring-primary/20"
				)}
			>
				{/* Progress bar at top */}
				<div className="h-1 bg-gray-100 dark:bg-gray-700">
					<motion.div
						className="h-full bg-linear-to-r from-primary to-primary/80"
						initial={{ width: 0 }}
						animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
						transition={{ duration: 0.3 }}
					/>
				</div>

				{/* Header with close button */}
				<div className="flex items-start justify-between p-4 pb-2">
					<div className="flex-1 pr-2">
						<h3 className="font-semibold text-foreground text-base">{title}</h3>
					</div>
					<StyledButton
						onClick={onSkip}
						aria-label="Skip tour"
						intent="plain"
						size="sm"
						showArrow={false}
						icon={<X className="w-4 h-4" />}
						className="shrink-0 p-1! min-w-0!"
					/>
				</div>

				{/* Description */}
				<div className="px-4 pb-3">
					<p className="text-sm text-muted-foreground leading-relaxed">
						{description}
					</p>
				</div>

				{/* Footer with navigation */}
				<div className="px-4 pb-4 flex items-center justify-between gap-3">
					{/* Progress indicator */}
					<div className="flex items-center gap-1.5">
						{Array.from({ length: totalSteps }).map((_, index) => (
							<div
								key={index}
								className={cn(
									"w-2 h-2 rounded-full transition-all duration-200",
									index === currentStep
										? "bg-primary w-4"
										: index < currentStep
										? "bg-primary/50"
										: "bg-gray-200 dark:bg-gray-600"
								)}
							/>
						))}
					</div>

					{/* Navigation buttons */}
					<div className="flex items-center gap-2">
						{!isFirstStep && (
							<StyledButton
								onClick={onPrev}
								aria-label="Previous step"
								intent="outline"
								size="sm"
								showArrow={false}
								icon={<ChevronLeft className="w-4 h-4" />}
								className="p-2! min-w-0!"
							/>
						)}
						<StyledButton
							onClick={onNext}
							intent="primary"
							size="sm"
							showArrow={!isLastStep}
							className="shadow-sm! hover:shadow-md!"
						>
							{isLastStep ? "Finish" : "Next"}
						</StyledButton>
					</div>
				</div>

				{/* Keyboard hints */}
				<div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
					<div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<Keyboard className="w-3 h-3" />
							<kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
								←
							</kbd>
							<kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
								→
							</kbd>
							<span>Navigate</span>
						</span>
						<span className="flex items-center gap-1.5">
							<kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 font-mono">
								Esc
							</kbd>
							<span>Exit</span>
						</span>
					</div>
				</div>
			</div>
		</motion.div>
	);

	// Use portal to render tooltip at document body level
	if (!mounted) return null;

	return createPortal(tooltipContent, document.body);
}

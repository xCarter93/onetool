"use client";

import {
	useEffect,
	useRef,
	useState,
	type ReactNode,
	type Context,
} from "react";
import { AnimatePresence } from "motion/react";
import { useTourContext, type TourContextType } from "./tour-context";
import { TourTooltip } from "./tour-tooltip";

// ============================================================================
// Types
// ============================================================================

export interface TourElementProps<T extends string> {
	children: ReactNode;
	TourContext: Context<TourContextType<T> | null>;
	stepId: T;
	title: string;
	description: string;
	tooltipPosition?: "top" | "bottom" | "left" | "right";
	/** Extra classes for the wrapper. The highlight ring is a ::after on this
	 * wrapper, so a target that positions itself out of flow (fixed/absolute)
	 * must hand its positioning here — otherwise the wrapper collapses to 0x0
	 * and the ring has nothing to draw around. */
	className?: string;
}

// ============================================================================
// TourElement Component
// ============================================================================

export function TourElement<T extends string>({
	children,
	TourContext,
	stepId,
	title,
	description,
	tooltipPosition = "bottom",
	className,
}: TourElementProps<T>) {
	const tourContextValue = useTourContext(TourContext);

	// No context: render children bare, but keep any positioning the caller
	// delegated to the wrapper.
	if (!tourContextValue) {
		return className ? <div className={className}>{children}</div> : <>{children}</>;
	}

	return (
		<TourElementContent
			stepId={stepId}
			title={title}
			description={description}
			tooltipPosition={tooltipPosition}
			tourContextValue={tourContextValue}
			className={className}
		>
			{children}
		</TourElementContent>
	);
}

// ============================================================================
// TourElementContent Component (with context available)
// ============================================================================

interface TourElementContentProps<T extends string> {
	children: ReactNode;
	tourContextValue: TourContextType<T>;
	stepId: T;
	title: string;
	description: string;
	tooltipPosition: "top" | "bottom" | "left" | "right";
	className?: string;
}

function TourElementContent<T extends string>({
	children,
	tourContextValue,
	stepId,
	title,
	description,
	tooltipPosition,
	className,
}: TourElementContentProps<T>) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

	const {
		state,
		dispatch,
		handleStepRegistration,
		currentStepIndex,
		totalSteps,
	} = tourContextValue;
	const isActive = state.currentStepId === stepId;
	const isFirstStep = currentStepIndex === 0;
	const isLastStep = currentStepIndex === totalSteps - 1;

	// Register this step with the provider on mount
	useEffect(() => {
		const unregister = handleStepRegistration(stepId);
		return unregister;
	}, [stepId, handleStepRegistration]);

	// Scroll element into view and get target rect when active
	useEffect(() => {
		if (isActive && wrapperRef.current) {
			// Scroll element into view
			wrapperRef.current.scrollIntoView({
				behavior: "smooth",
				block: "center",
				inline: "center",
			});

			// Small delay to ensure scroll is complete, then get rect
			const timer = setTimeout(() => {
				if (wrapperRef.current) {
					setTargetRect(wrapperRef.current.getBoundingClientRect());
				}
			}, 100);

			// Update rect on resize/scroll
			const updateRect = () => {
				if (wrapperRef.current) {
					setTargetRect(wrapperRef.current.getBoundingClientRect());
				}
			};

			window.addEventListener("resize", updateRect);
			window.addEventListener("scroll", updateRect, true);

			return () => {
				clearTimeout(timer);
				window.removeEventListener("resize", updateRect);
				window.removeEventListener("scroll", updateRect, true);
			};
		} else {
			setTargetRect(null);
		}
	}, [isActive]);

	const handleNext = () => {
		dispatch({ type: "NEXT_STEP" });
	};

	const handlePrev = () => {
		dispatch({ type: "PREV_STEP" });
	};

	const handleSkip = () => {
		dispatch({ type: "DISMISS" });
	};

	return (
		<div
			ref={wrapperRef}
			className={className ? `tour-element-wrapper ${className}` : "tour-element-wrapper"}
			data-tour-active={isActive}
			data-tour-step={stepId}
			aria-expanded={isActive}
		>
			{children}

			<AnimatePresence>
				{isActive && targetRect && (
					<TourTooltip
						title={title}
						description={description}
						currentStep={currentStepIndex}
						totalSteps={totalSteps}
						onNext={handleNext}
						onPrev={handlePrev}
						onSkip={handleSkip}
						position={tooltipPosition}
						isFirstStep={isFirstStep}
						isLastStep={isLastStep}
						targetRect={targetRect}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}

"use client";

import React, {
	createContext,
	useContext,
	useReducer,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	useMemo,
	type ReactNode,
	type Dispatch,
	type Context,
} from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

// ============================================================================
// Types
// ============================================================================

export interface TourState<T extends string> {
	currentStepId: T | null;
	isActive: boolean;
	completedSteps: Set<T>;
}

export type TourAction<T extends string> =
	| { type: "START_TOUR" }
	| { type: "NEXT_STEP" }
	| { type: "PREV_STEP" }
	| { type: "GO_TO_STEP"; stepId: T }
	| { type: "END_TOUR" }
	| { type: "DISMISS" };

export interface TourContextType<T extends string> {
	state: TourState<T>;
	dispatch: Dispatch<TourAction<T>>;
	handleStepRegistration: (stepId: T) => () => void;
	isRegistered: boolean;
	orderedStepIds: T[];
	currentStepIndex: number;
	totalSteps: number;
}

export interface TourContextProviderProps<T extends string> {
	children: ReactNode;
	TourContext: Context<TourContextType<T> | null>;
	orderedStepIds: T[];
	onComplete?: () => void;
	onDismiss?: () => void;
}

// ============================================================================
// Reducer
// ============================================================================

function createTourReducer<T extends string>(orderedStepIds: T[]) {
	return function tourReducer(
		state: TourState<T>,
		action: TourAction<T>
	): TourState<T> {
		switch (action.type) {
			case "START_TOUR": {
				if (orderedStepIds.length === 0) return state;
				return {
					...state,
					isActive: true,
					currentStepId: orderedStepIds[0],
					completedSteps: new Set(),
				};
			}

			case "NEXT_STEP": {
				if (!state.currentStepId) return state;
				const currentIndex = orderedStepIds.indexOf(state.currentStepId);
				const nextIndex = currentIndex + 1;

				// Mark current step as completed
				const newCompleted = new Set(state.completedSteps);
				newCompleted.add(state.currentStepId);

				// If we've reached the end, complete the tour
				if (nextIndex >= orderedStepIds.length) {
					return {
						...state,
						isActive: false,
						currentStepId: null,
						completedSteps: newCompleted,
					};
				}

				return {
					...state,
					currentStepId: orderedStepIds[nextIndex],
					completedSteps: newCompleted,
				};
			}

			case "PREV_STEP": {
				if (!state.currentStepId) return state;
				const currentIndex = orderedStepIds.indexOf(state.currentStepId);
				const prevIndex = Math.max(0, currentIndex - 1);

				return {
					...state,
					currentStepId: orderedStepIds[prevIndex],
				};
			}

			case "GO_TO_STEP": {
				if (!orderedStepIds.includes(action.stepId)) return state;
				return {
					...state,
					currentStepId: action.stepId,
				};
			}

			case "END_TOUR": {
				// Mark all steps as completed
				const allCompleted = new Set(orderedStepIds);
				return {
					...state,
					isActive: false,
					currentStepId: null,
					completedSteps: allCompleted,
				};
			}

			case "DISMISS": {
				return {
					...state,
					isActive: false,
					currentStepId: null,
				};
			}

			default:
				return state;
		}
	};
}

// ============================================================================
// Provider Component
// ============================================================================

export function TourContextProvider<T extends string>({
	children,
	TourContext,
	orderedStepIds,
	onComplete,
	onDismiss,
}: TourContextProviderProps<T>) {
	const tourReducer = useCallback(
		(state: TourState<T>, action: TourAction<T>) =>
			createTourReducer(orderedStepIds)(state, action),
		[orderedStepIds]
	);

	const [state, dispatch] = useReducer(tourReducer, {
		currentStepId: null,
		isActive: false,
		completedSteps: new Set<T>(),
	});

	const [isRegistered, setIsRegistered] = useState(false);
	const registry = useRef<Set<T>>(new Set());
	const prevIsActive = useRef(state.isActive);
	const prevCurrentStepId = useRef(state.currentStepId);

	// Track mounting for portal rendering (false during SSR/first render)
	const mounted = useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false
	);

	// Handle step registration
	const handleStepRegistration = useCallback(
		(stepId: T) => {
			registry.current.add(stepId);

			// Check if all steps are registered
			const isCompletelyRegistered = orderedStepIds.every((id) =>
				registry.current.has(id)
			);

			if (isCompletelyRegistered) {
				setIsRegistered(true);
			}

			// Return cleanup function
			return () => {
				registry.current.delete(stepId);
				setIsRegistered(false);
			};
		},
		[orderedStepIds]
	);

	// Handle tour completion/dismissal callbacks
	useEffect(() => {
		// Tour just ended (was active, now not)
		if (prevIsActive.current && !state.isActive) {
			// Check if all steps were completed
			const allCompleted = orderedStepIds.every((id) =>
				state.completedSteps.has(id)
			);
			if (allCompleted) {
				onComplete?.();
			} else {
				onDismiss?.();
			}
		}

		prevIsActive.current = state.isActive;
		prevCurrentStepId.current = state.currentStepId;
	}, [
		state.isActive,
		state.completedSteps,
		orderedStepIds,
		onComplete,
		onDismiss,
	]);

	// Handle keyboard navigation
	useEffect(() => {
		if (!state.isActive) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			switch (event.key) {
				case "ArrowRight":
				case "Enter":
					event.preventDefault();
					dispatch({ type: "NEXT_STEP" });
					break;
				case "ArrowLeft":
					event.preventDefault();
					dispatch({ type: "PREV_STEP" });
					break;
				case "Escape":
					event.preventDefault();
					dispatch({ type: "DISMISS" });
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [state.isActive]);

	// Add body class when tour is active for global CSS targeting
	useEffect(() => {
		if (state.isActive) {
			document.body.classList.add("tour-active");
			// Add step-specific class for sidebar steps
			if (state.currentStepId) {
				document.body.setAttribute("data-tour-step", state.currentStepId);
			}
		} else {
			document.body.classList.remove("tour-active");
			document.body.removeAttribute("data-tour-step");
		}

		return () => {
			document.body.classList.remove("tour-active");
			document.body.removeAttribute("data-tour-step");
		};
	}, [state.isActive, state.currentStepId]);

	// Calculate current step index
	const currentStepIndex = state.currentStepId
		? orderedStepIds.indexOf(state.currentStepId)
		: -1;

	// Memoize context value to prevent unnecessary re-renders
	const contextValue = useMemo<TourContextType<T>>(
		() => ({
			state,
			dispatch,
			handleStepRegistration,
			isRegistered,
			orderedStepIds,
			currentStepIndex,
			totalSteps: orderedStepIds.length,
		}),
		[
			state,
			handleStepRegistration,
			isRegistered,
			orderedStepIds,
			currentStepIndex,
		]
	);

	return (
		<TourContext.Provider value={contextValue}>
			{/* Frosted glass overlay - rendered via portal to document body */}
			{state.isActive &&
				mounted &&
				createPortal(
					<div
						className="tour-overlay"
						aria-hidden="true"
						onClick={() => dispatch({ type: "DISMISS" })}
					/>,
					document.body
				)}
			{children}
		</TourContext.Provider>
	);
}

// ============================================================================
// Hook for consuming tour context
// ============================================================================

export function useTourContext<T extends string>(
	TourContext: Context<TourContextType<T> | null>
): TourContextType<T> | null {
	return useContext(TourContext);
}

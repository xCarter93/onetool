"use client";

import React, { useState, useEffect, useRef } from "react";
import ActivityFeed from "@/app/(workspace)/home/components/activity-feed";
import GettingStarted from "@/app/(workspace)/home/components/getting-started";
import HomeStats from "@/app/(workspace)/home/components/home-stats-real";
import HomeTaskList from "@/app/(workspace)/home/components/home-task-list";
import RevenueGoalSetter from "@/app/(workspace)/home/components/revenue-goal-setter";
import { CalendarContainer } from "@/app/(workspace)/home/components/calendar/calendar-container";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { motion } from "motion/react";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ButtonGroup } from "@/components/ui/button-group";
import { LayoutDashboard, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	TourElement,
	TourStartModal,
	HomeTour,
	ORDERED_HOME_TOUR,
	HOME_TOUR_CONTENT,
	HomeTourContext,
} from "@/components/tours";

type ViewMode = "dashboard" | "calendar";

export default function Page() {
	const user = useQuery(api.users.current);
	const hasSeenTour = useQuery(api.userTour.hasSeenTour);
	const markTourComplete = useMutation(api.userTour.markTourComplete);
	const skipTour = useMutation(api.userTour.skipTour);

	const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
	const [showTourModal, setShowTourModal] = useState(false);
	const [tourStarted, setTourStarted] = useState(false);

	// Get tour context from layout-level provider
	const tourContext = React.useContext(HomeTourContext);

	// Automatically detect and save timezone if not set
	useAutoTimezone();

	// Detect desktop breakpoint (xl = 1280px) to conditionally render ActivityFeed
	// This prevents duplicate queries from rendering both mobile and desktop versions
	const isDesktop = useMediaQuery("(min-width: 1280px)");

	// Load view preference from localStorage
	useEffect(() => {
		const savedView = localStorage.getItem("home-view-mode");
		if (savedView === "calendar" || savedView === "dashboard") {
			setViewMode(savedView);
		}
	}, []);

	// Show tour modal for first-time users
	useEffect(() => {
		if (hasSeenTour === false && user && !tourStarted) {
			// Small delay to let the page render first
			const timer = setTimeout(() => {
				setShowTourModal(true);
			}, 1000);
			return () => clearTimeout(timer);
		}
	}, [hasSeenTour, user, tourStarted]);

	// Watch for tour completion/dismissal and call appropriate mutations
	const prevTourActive = useRef(tourContext?.state.isActive);
	useEffect(() => {
		// Tour just ended (was active, now not)
		if (prevTourActive.current && !tourContext?.state.isActive && tourStarted) {
			// Check if all steps were completed
			const allCompleted = ORDERED_HOME_TOUR.every((id) =>
				tourContext?.state.completedSteps.has(id),
			);

			if (allCompleted) {
				markTourComplete();
			}
			setTourStarted(false);
		}

		prevTourActive.current = tourContext?.state.isActive;
	}, [
		tourContext?.state.isActive,
		tourContext?.state.completedSteps,
		tourStarted,
		markTourComplete,
	]);

	// Save view preference to localStorage
	const handleViewChange = (mode: ViewMode) => {
		setViewMode(mode);
		localStorage.setItem("home-view-mode", mode);
	};

	const handleStartTour = () => {
		setShowTourModal(false);
		setTourStarted(true);
	};

	const handleSkipTour = () => {
		setShowTourModal(false);
	};

	const handleDontShowAgain = async () => {
		setShowTourModal(false);
		await skipTour();
	};

	const formatDate = () => {
		const now = new Date();
		return now.toLocaleDateString("en-US", {
			weekday: "long",
			month: "long",
			day: "numeric",
		});
	};

	const getWelcomeMessage = () => {
		if (!user?.name) return "Welcome back to OneTool!";

		const firstName = user.name.split(" ")[0];
		const messages = [
			`Welcome back, ${firstName}! Ready to conquer your tasks?`,
			`Good to see you again, ${firstName}! Let's make today productive.`,
			`Hello ${firstName}! OneTool is here to streamline your workflow.`,
			`Welcome back ${firstName}! Let's turn ideas into action.`,
		];

		// Use a simple hash of the date to consistently show the same message per day
		const today = new Date().toDateString();
		const hash = today.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
		return messages[hash % messages.length];
	};

	return (
		<>
			{/* Tour Start Modal */}
			<TourStartModal
				isOpen={showTourModal}
				onStartTour={handleStartTour}
				onSkip={handleSkipTour}
				onDontShowAgain={handleDontShowAgain}
			/>

			{/* Tour Auto-Start Trigger */}
			<TourAutoStart tourStarted={tourStarted} />

			<motion.div
				className={`relative p-4 sm:p-6 lg:px-8 lg:pb-8 lg:pt-12 flex flex-col ${
					viewMode === "calendar" ? "h-[calc(100vh-5rem)]" : ""
				}`}
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
			>
				{/* Modern Header */}
				<motion.div
					className="mb-8 sm:mb-10"
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.1 }}
				>
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-3">
							<div className="w-1 h-8 bg-linear-to-b from-primary via-primary/80 to-primary/60 rounded-full" />
							<time className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
								{formatDate()}
							</time>
						</div>

						{/* View Toggle - Tour Step */}
						<TourElement<HomeTour>
							TourContext={HomeTourContext}
							stepId={HomeTour.VIEW_TOGGLE}
							title={HOME_TOUR_CONTENT[HomeTour.VIEW_TOGGLE].title}
							description={HOME_TOUR_CONTENT[HomeTour.VIEW_TOGGLE].description}
							tooltipPosition={
								HOME_TOUR_CONTENT[HomeTour.VIEW_TOGGLE].tooltipPosition
							}
						>
							<ButtonGroup>
								<button
									onClick={() => handleViewChange("dashboard")}
									aria-pressed={viewMode === "dashboard"}
									aria-label="Dashboard view"
									className={cn(
										"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
										viewMode === "dashboard"
											? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
											: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700",
									)}
								>
									<LayoutDashboard className="w-4 h-4" />
									<span className="hidden sm:inline">Dashboard</span>
								</button>
								<button
									onClick={() => handleViewChange("calendar")}
									aria-pressed={viewMode === "calendar"}
									aria-label="Calendar view"
									className={cn(
										"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
										viewMode === "calendar"
											? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
											: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700",
									)}
								>
									<CalendarDays className="w-4 h-4" />
									<span className="hidden sm:inline">Calendar</span>
								</button>
							</ButtonGroup>
						</TourElement>
					</div>
					<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground leading-tight tracking-tight">
						{getWelcomeMessage()}
					</h1>
				</motion.div>

				{/* Conditional View Rendering */}
				{viewMode === "dashboard" ? (
					<>
						{/* Home Stats - Tour Step */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.2 }}
						>
							<TourElement<HomeTour>
								TourContext={HomeTourContext}
								stepId={HomeTour.HOME_STATS}
								title={HOME_TOUR_CONTENT[HomeTour.HOME_STATS].title}
								description={HOME_TOUR_CONTENT[HomeTour.HOME_STATS].description}
								tooltipPosition={
									HOME_TOUR_CONTENT[HomeTour.HOME_STATS].tooltipPosition
								}
							>
								<HomeStats />
							</TourElement>
						</motion.div>

						{/* Dashboard Layout with Sticky Activity Sidebar */}
						<div className="flex flex-col xl:flex-row gap-6 lg:gap-8">
							{/* Main Content Area */}
							<motion.div
								className="flex-1 min-w-0 space-y-6 lg:space-y-8"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.5, delay: 0.3 }}
							>
								{/* Tasks Section - Most actionable, daily priority */}
								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.5, delay: 0.35 }}
								>
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.TASKS}
										title={HOME_TOUR_CONTENT[HomeTour.TASKS].title}
										description={HOME_TOUR_CONTENT[HomeTour.TASKS].description}
										tooltipPosition={
											HOME_TOUR_CONTENT[HomeTour.TASKS].tooltipPosition
										}
									>
										<HomeTaskList />
									</TourElement>
								</motion.div>

								{/* Revenue Goal - Quick KPI */}
								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.5, delay: 0.4 }}
								>
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.REVENUE_GOAL}
										title={HOME_TOUR_CONTENT[HomeTour.REVENUE_GOAL].title}
										description={
											HOME_TOUR_CONTENT[HomeTour.REVENUE_GOAL].description
										}
										tooltipPosition={
											HOME_TOUR_CONTENT[HomeTour.REVENUE_GOAL].tooltipPosition
										}
									>
										<RevenueGoalSetter />
									</TourElement>
								</motion.div>

								{/* Getting Started Section - Onboarding journey */}
								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										type: "spring",
										stiffness: 300,
										damping: 30,
										delay: 0.5,
									}}
								>
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.GETTING_STARTED}
										title={HOME_TOUR_CONTENT[HomeTour.GETTING_STARTED].title}
										description={
											HOME_TOUR_CONTENT[HomeTour.GETTING_STARTED].description
										}
										tooltipPosition={
											HOME_TOUR_CONTENT[HomeTour.GETTING_STARTED]
												.tooltipPosition
										}
									>
										<GettingStarted />
									</TourElement>
								</motion.div>
							</motion.div>

							{/* Activity Feed - Single instance, conditionally rendered for desktop vs mobile */}
							{isDesktop ? (
								<motion.div
									className="w-[650px] shrink-0"
									initial={{ opacity: 0, x: 20 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{
										type: "spring",
										stiffness: 300,
										damping: 30,
										delay: 0.4,
									}}
								>
									<div className="sticky top-24">
										<TourElement<HomeTour>
											TourContext={HomeTourContext}
											stepId={HomeTour.ACTIVITY_FEED}
											title={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].title}
											description={
												HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].description
											}
											tooltipPosition={
												HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED]
													.tooltipPosition
											}
										>
											<ActivityFeed />
										</TourElement>
									</div>
								</motion.div>
							) : isDesktop === false ? (
								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										type: "spring",
										stiffness: 300,
										damping: 30,
										delay: 0.55,
									}}
								>
									<ActivityFeed />
								</motion.div>
							) : null}
						</div>
					</>
				) : (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.3 }}
						className="flex-1 min-h-0 bg-background rounded-lg border border-border shadow-sm overflow-hidden"
					>
						<CalendarContainer />
					</motion.div>
				)}
			</motion.div>
		</>
	);
}

// Helper component to auto-start tour after modal closes
function TourAutoStart({ tourStarted }: { tourStarted: boolean }) {
	const contextValue = React.useContext(HomeTourContext);
	const hasStartedRef = React.useRef(false);

	React.useEffect(() => {
		// Only start the tour once when tourStarted becomes true and context is ready
		if (
			tourStarted &&
			contextValue?.isRegistered &&
			!hasStartedRef.current &&
			!contextValue.state.isActive
		) {
			hasStartedRef.current = true;
			// Small delay to ensure all elements are rendered
			const timer = setTimeout(() => {
				contextValue.dispatch({ type: "START_TOUR" });
			}, 300);
			return () => clearTimeout(timer);
		}

		// Reset the ref when tour is not started (for potential retrigger)
		if (!tourStarted) {
			hasStartedRef.current = false;
		}
	}, [tourStarted, contextValue]);

	return null;
}

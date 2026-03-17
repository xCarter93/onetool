"use client";

import React, { useState, useEffect, useRef } from "react";
import ActivityFeed from "@/app/(workspace)/home/components/activity-feed";
import HomeStats from "@/app/(workspace)/home/components/home-stats-real";
import { NeedsAttention } from "@/app/(workspace)/home/components/needs-attention";
import OnboardingBanner from "@/app/(workspace)/home/components/onboarding-banner";
import { CalendarContainer } from "@/app/(workspace)/home/components/calendar/calendar-container";
import { WeeklyAgenda } from "@/app/(workspace)/home/components/weekly-agenda";
import ClientPropertiesMap from "@/app/(workspace)/home/components/client-properties-map";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { motion } from "motion/react";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
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

	const getGreeting = () => {
		const hour = new Date().getHours();
		const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
		const firstName = user?.name?.split(" ")[0];
		return firstName ? `Good ${timeOfDay}, ${firstName}` : `Good ${timeOfDay}`;
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

			<div
				className={`relative p-4 sm:p-6 lg:px-8 lg:pb-8 lg:pt-12 flex flex-col ${
					viewMode === "calendar" ? "h-[calc(100vh-5rem)]" : ""
				}`}
			>
				{/* Header */}
				<div className="mb-8 sm:mb-10 flex items-start justify-between">
					<div>
						<h1 className="text-2xl sm:text-3xl font-semibold text-foreground leading-tight tracking-tight">
							{getGreeting()}
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							{formatDate()}
						</p>
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
										: "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border",
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
										: "text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted ring-transparent hover:ring-border",
								)}
							>
								<CalendarDays className="w-4 h-4" />
								<span className="hidden sm:inline">Calendar</span>
							</button>
						</ButtonGroup>
					</TourElement>
				</div>

				{/* Conditional View Rendering */}
				{viewMode === "dashboard" ? (
					<>
						{/* Animation Group 1: Banner + Stats - no delay */}
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
							{/* Onboarding Banner - Tour Step */}
							<TourElement<HomeTour>
								TourContext={HomeTourContext}
								stepId={HomeTour.ONBOARDING_BANNER}
								title={HOME_TOUR_CONTENT[HomeTour.ONBOARDING_BANNER].title}
								description={
									HOME_TOUR_CONTENT[HomeTour.ONBOARDING_BANNER].description
								}
								tooltipPosition={
									HOME_TOUR_CONTENT[HomeTour.ONBOARDING_BANNER].tooltipPosition
								}
							>
								<OnboardingBanner />
							</TourElement>

							{/* Home Stats - Tour Step */}
							<div className="mt-6">
								<TourElement<HomeTour>
									TourContext={HomeTourContext}
									stepId={HomeTour.HOME_STATS}
									title={HOME_TOUR_CONTENT[HomeTour.HOME_STATS].title}
									description={
										HOME_TOUR_CONTENT[HomeTour.HOME_STATS].description
									}
									tooltipPosition={
										HOME_TOUR_CONTENT[HomeTour.HOME_STATS].tooltipPosition
									}
								>
									<HomeStats />
								</TourElement>
							</div>
						</motion.div>

						{/* Animation Group 1.5: Weekly Calendar + Map - 50ms delay */}
						<motion.div
							className="border-t border-border pt-6 mt-6"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
						>
							<div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-8">
								{/* Weekly Calendar - 65% */}
								<div className="lg:basis-[65%] flex-1 min-w-0">
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.WEEKLY_CALENDAR}
										title={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].title}
										description={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].description}
										tooltipPosition={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].tooltipPosition}
									>
										<WeeklyAgenda
											onEventClick={() => {
												handleViewChange("calendar");
											}}
										/>
									</TourElement>
								</div>

								{/* Map - 35% */}
								<div className="lg:basis-[35%] lg:max-w-[35%] mt-6 lg:mt-0 flex flex-col">
									<div className="flex items-center justify-between mb-3 min-h-[2.75rem]">
										<h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
											Client Locations
										</h3>
									</div>
									<div className="h-[300px] lg:flex-1 lg:h-auto lg:min-h-[300px] [&>.tour-element-wrapper]:h-full">
										<TourElement<HomeTour>
											TourContext={HomeTourContext}
											stepId={HomeTour.CLIENT_MAP}
											title={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].title}
											description={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].description}
											tooltipPosition={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].tooltipPosition}
										>
											<div className="relative rounded-lg border border-border overflow-hidden h-full">
												<ClientPropertiesMap />
											</div>
										</TourElement>
									</div>
								</div>
							</div>
						</motion.div>

						{/* Animation Group 2: Needs Attention + Activity Feed - 100ms delay */}
						<motion.div
							className="border-t border-border pt-6 mt-6"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
						>
							<div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-8">
								{/* Needs Attention - 65% */}
								<div className="lg:basis-[65%] flex-1 min-w-0">
									<div className="rounded-lg border border-border p-4">
										<TourElement<HomeTour>
											TourContext={HomeTourContext}
											stepId={HomeTour.TASKS}
											title={HOME_TOUR_CONTENT[HomeTour.TASKS].title}
											description={
												HOME_TOUR_CONTENT[HomeTour.TASKS].description
											}
											tooltipPosition={
												HOME_TOUR_CONTENT[HomeTour.TASKS].tooltipPosition
											}
										>
											<NeedsAttention />
										</TourElement>
									</div>
								</div>

								{/* Activity Feed - 35% */}
								<div className="lg:basis-[35%] lg:max-w-[35%] mt-6 lg:mt-0 flex flex-col">
									<div className="rounded-lg border border-border p-4 flex-1">
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
								</div>
							</div>
						</motion.div>
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
			</div>
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

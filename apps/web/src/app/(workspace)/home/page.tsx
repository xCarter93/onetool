"use client";

import React, { useState, useEffect, useRef } from "react";
import ActivityFeed from "@/app/(workspace)/home/components/activity-feed";
import HomeStats from "@/app/(workspace)/home/components/home-stats-real";
import { NeedsAttention } from "@/app/(workspace)/home/components/needs-attention";
import { CalendarContainer } from "@/app/(workspace)/home/components/calendar/calendar-container";
import { SchedulePanel } from "@/app/(workspace)/home/components/schedule/schedule-panel";
import ClientPropertiesMap from "@/app/(workspace)/home/components/client-properties-map";
import { Frame, FramePanel } from "@/components/reui/frame";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { motion } from "motion/react";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
import { usePublishScreenContext } from "@/components/assistant/use-screen-context";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { LayoutDashboard, CalendarDays } from "lucide-react";
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

	// Let the assistant see which home view is active ("what am I looking at?")
	usePublishScreenContext(() => ({ homeView: viewMode }));

	// True only after client hydration; gates localStorage reads to avoid mismatch
	const hydrated = React.useSyncExternalStore(
		() => () => {},
		() => true,
		() => false
	);

	// Load saved view preference after hydration, once
	const [viewLoaded, setViewLoaded] = useState(false);
	if (hydrated && !viewLoaded) {
		setViewLoaded(true);
		const savedView = localStorage.getItem("home-view-mode");
		if (savedView === "calendar" || savedView === "dashboard") {
			setViewMode(savedView);
		}
	}

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
						<h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight tracking-tight">
							{getGreeting()}
						</h1>
						<p className="text-sm text-muted-foreground mt-1.5">
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
						<SegmentedControl
							value={viewMode}
							onValueChange={handleViewChange}
							options={[
								{
									value: "dashboard",
									label: "Dashboard",
									icon: <LayoutDashboard className="w-4 h-4" />,
									ariaLabel: "Dashboard view",
									hideLabelOnMobile: true,
								},
								{
									value: "calendar",
									label: "Calendar",
									icon: <CalendarDays className="w-4 h-4" />,
									ariaLabel: "Calendar view",
									hideLabelOnMobile: true,
								},
							]}
						/>
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
							{/* Home Stats - Tour Step */}
							<div>
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

						{/* Animation Group 2: Content bento — asymmetric tiles */}
						<motion.div
							className="mt-8"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
						>
							<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
								{/* Schedule — 7 cols */}
								<div className="lg:col-span-7">
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.WEEKLY_CALENDAR}
										title={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].title}
										description={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].description}
										tooltipPosition={HOME_TOUR_CONTENT[HomeTour.WEEKLY_CALENDAR].tooltipPosition}
									>
										<SchedulePanel
											onEventClick={() => {
												handleViewChange("calendar");
											}}
										/>
									</TourElement>
								</div>
								{/* Client Locations map — 5 cols (Frame owned by component) */}
								<div className="lg:col-span-5 [&>.tour-element-wrapper]:h-full">
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.CLIENT_MAP}
										title={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].title}
										description={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].description}
										tooltipPosition={HOME_TOUR_CONTENT[HomeTour.CLIENT_MAP].tooltipPosition}
									>
										<ClientPropertiesMap />
									</TourElement>
								</div>
								{/* Needs Attention — 7 cols */}
								<Frame className="w-full lg:col-span-7">
									<FramePanel className="grow">
										<TourElement<HomeTour>
											TourContext={HomeTourContext}
											stepId={HomeTour.TASKS}
											title={HOME_TOUR_CONTENT[HomeTour.TASKS].title}
											description={HOME_TOUR_CONTENT[HomeTour.TASKS].description}
											tooltipPosition={HOME_TOUR_CONTENT[HomeTour.TASKS].tooltipPosition}
										>
											<NeedsAttention />
										</TourElement>
									</FramePanel>
								</Frame>
								{/* Activity Feed — 5 cols */}
								<Frame className="w-full lg:col-span-5">
									<FramePanel className="grow">
										<TourElement<HomeTour>
											TourContext={HomeTourContext}
											stepId={HomeTour.ACTIVITY_FEED}
											title={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].title}
											description={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].description}
											tooltipPosition={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].tooltipPosition}
										>
											<ActivityFeed />
										</TourElement>
									</FramePanel>
								</Frame>
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

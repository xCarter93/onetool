"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ActivityCard } from "@/app/(workspace)/home/components/activity-card";
import { BusinessOverviewPanel } from "@/app/(workspace)/home/components/business-overview-panel";
import { CollectionPaceCard } from "@/app/(workspace)/home/components/collection-pace-card";
import { TopClientsCard } from "@/app/(workspace)/home/components/top-clients-card";
import { SchedulePanel } from "@/app/(workspace)/home/components/schedule/schedule-panel";
import { RecentEmails } from "@/app/(workspace)/home/components/recent-emails";
import type { DashboardPeriod } from "@/app/(workspace)/home/components/dashboard-period";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { motion } from "motion/react";
import { useAutoTimezone } from "@/hooks/use-auto-timezone";
import { useIsMobile } from "@/hooks/use-mobile";
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

// Code-split so the event calendar stays out of the initial /home chunk
// (field LCP p75 ~3.4s was dominated by script cost before paint).
const HomeCalendar = dynamic(
	() =>
		import("@/app/(workspace)/home/components/calendar/home-calendar").then(
			(m) => ({ default: m.HomeCalendar })
		),
	{ ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

type ViewMode = "dashboard" | "calendar";

export default function Page() {
	const user = useQuery(api.users.current);
	const hasSeenTour = useQuery(api.userTour.hasSeenTour);
	const markTourComplete = useMutation(api.userTour.markTourComplete);
	const skipTour = useMutation(api.userTour.skipTour);

	const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
	// Lifted so the overview, collection pace and top clients share one window.
	const [period, setPeriod] = useState<DashboardPeriod>("month");
	const [showTourModal, setShowTourModal] = useState(false);
	const [tourStarted, setTourStarted] = useState(false);
	// Once the welcome modal has been answered, never re-open it this session —
	// the hasSeenTour round-trip is slower than the 1s timer below.
	const tourAnsweredRef = useRef(false);
	const isMobile = useIsMobile();

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
		if (
			hasSeenTour === false &&
			user &&
			!tourStarted &&
			!tourAnsweredRef.current &&
			// The sidebar lives in a closed Sheet below md, so steps 1-4 never
			// register and the tour cannot start. Desktop-only.
			!isMobile
		) {
			// Small delay to let the page render first
			const timer = setTimeout(() => {
				setShowTourModal(true);
			}, 1000);
			return () => clearTimeout(timer);
		}
	}, [hasSeenTour, user, tourStarted, isMobile]);

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
				markTourComplete().catch(() => {});
			} else {
				// Dismissed mid-tour — still "seen", or the welcome modal returns.
				skipTour().catch(() => {});
			}
			setTourStarted(false);
		}

		prevTourActive.current = tourContext?.state.isActive;
	}, [
		tourContext?.state.isActive,
		tourContext?.state.completedSteps,
		tourStarted,
		markTourComplete,
		skipTour,
	]);

	// Save view preference to localStorage
	const handleViewChange = (mode: ViewMode) => {
		setViewMode(mode);
		localStorage.setItem("home-view-mode", mode);
	};

	const handleStartTour = () => {
		tourAnsweredRef.current = true;
		setShowTourModal(false);
		// Dashboard-only steps must be mounted for the tour to register; forced
		// via state so the saved view preference survives.
		setViewMode("dashboard");
		setTourStarted(true);
	};

	const handleSkipTour = () => {
		tourAnsweredRef.current = true;
		setShowTourModal(false);
	};

	const handleDontShowAgain = async () => {
		tourAnsweredRef.current = true;
		setShowTourModal(false);
		await skipTour().catch(() => {});
	};

	// Replay entry from the help menu (/home?tour=1).
	const handleReplayTour = React.useCallback(() => {
		tourAnsweredRef.current = true;
		setShowTourModal(false);
		setViewMode("dashboard");
		setTourStarted(true);
	}, []);

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

			{/* Replay entry: /home?tour=1 from the help menu */}
			<Suspense fallback={null}>
				<TourReplayWatcher onReplay={handleReplayTour} />
			</Suspense>

			<div
				className={`relative p-4 sm:p-6 lg:px-8 lg:pb-8 lg:pt-12 flex flex-col ${
					viewMode === "calendar" ? "h-[calc(100vh-5rem)]" : ""
				}`}
			>
				{/* Header */}
				<div className="mb-6 sm:mb-8 flex items-start justify-between">
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
						{/* Animation Group 1: Business overview + Needs Attention queue */}
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut" }}
						>
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
								<BusinessOverviewPanel
									period={period}
									onPeriodChange={setPeriod}
								/>
							</TourElement>
						</motion.div>

						{/* Animation Group 2: money + schedule, then clients + activity */}
						<motion.div
							className="mt-4"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
						>
							<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
								<CollectionPaceCard
									period={period}
									className="lg:col-span-7"
								/>
								<TopClientsCard period={period} className="lg:col-span-5" />

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
								<div className="lg:col-span-5 [&>.tour-element-wrapper]:h-full">
									<TourElement<HomeTour>
										TourContext={HomeTourContext}
										stepId={HomeTour.ACTIVITY_FEED}
										title={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].title}
										description={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].description}
										tooltipPosition={HOME_TOUR_CONTENT[HomeTour.ACTIVITY_FEED].tooltipPosition}
									>
										<ActivityCard className="h-full" />
									</TourElement>
								</div>

								{/* Recent emails — full-width strip; single-line rows want the
								    width (Frame owned by component) */}
								<RecentEmails className="w-full lg:col-span-12" />
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
						<HomeCalendar />
					</motion.div>
				)}
			</div>
		</>
	);
}

// Consumes the ?tour=1 replay flag, then strips it so a refresh doesn't restart.
function TourReplayWatcher({ onReplay }: { onReplay: () => void }) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const requested = searchParams.get("tour") === "1";

	React.useEffect(() => {
		if (!requested) return;
		router.replace("/home");
		onReplay();
	}, [requested, router, onReplay]);

	return null;
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

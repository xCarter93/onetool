"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Sparkles, X } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface TourStartModalProps {
	isOpen: boolean;
	onStartTour: () => void;
	onSkip: () => void;
	onDontShowAgain: () => void;
}

export function TourStartModal({
	isOpen,
	onStartTour,
	onSkip,
	onDontShowAgain,
}: TourStartModalProps) {
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const modalRef = useRef<HTMLDivElement>(null);
	const previousActiveElement = useRef<HTMLElement | null>(null);

	// Handle focus management
	useEffect(() => {
		if (isOpen) {
			previousActiveElement.current = document.activeElement as HTMLElement;

			const focusTimeout = setTimeout(() => {
				const modalElement = modalRef.current;
				if (modalElement) {
					const focusableElements = modalElement.querySelectorAll<HTMLElement>(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					);
					if (focusableElements.length > 0) {
						focusableElements[0].focus();
					}
				}
			}, 100);

			return () => {
				clearTimeout(focusTimeout);
				if (previousActiveElement.current) {
					previousActiveElement.current.focus();
				}
			};
		}
	}, [isOpen]);

	// Handle body scroll lock
	useEffect(() => {
		if (isOpen) {
			const originalOverflow = document.body.style.overflow;
			document.body.style.overflow = "hidden";

			return () => {
				document.body.style.overflow = originalOverflow || "";
			};
		}
	}, [isOpen]);

	// Handle escape key
	useEffect(() => {
		if (!isOpen) return;

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				handleSkip();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen]);

	const handleSkip = () => {
		if (dontShowAgain) {
			onDontShowAgain();
		} else {
			onSkip();
		}
	};

	const handleStartTour = () => {
		onStartTour();
	};

	if (!isOpen) return null;

	const modalContent = (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					className="fixed inset-0 z-9999 flex items-center justify-center pointer-events-auto"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					{/* Backdrop */}
					<motion.div
						className={cn(
							"absolute inset-0 backdrop-blur-sm",
							"bg-black/50 dark:bg-black/70"
						)}
						onClick={handleSkip}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					/>

					{/* Modal Content */}
					<motion.div
						ref={modalRef}
						className={cn(
							"relative rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden",
							"bg-white dark:bg-gray-900",
							"border border-gray-200 dark:border-gray-700"
						)}
						initial={{ opacity: 0, scale: 0.9, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.9, y: 20 }}
						transition={{ type: "spring", damping: 25, stiffness: 300 }}
						role="dialog"
						aria-modal="true"
						aria-labelledby="tour-modal-title"
						tabIndex={-1}
					>
						{/* Decorative gradient header */}
						<div className="relative h-32 bg-linear-to-br from-primary via-primary/80 to-primary/60 overflow-hidden">
							{/* Decorative circles */}
							<div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
							<div className="absolute -bottom-5 -left-5 w-24 h-24 bg-white/10 rounded-full" />

							{/* Close button */}
							<button
								onClick={handleSkip}
								aria-label="Close"
								className={cn(
									"absolute top-3 right-3 p-2 rounded-full transition-colors",
									"text-white/80 hover:text-white hover:bg-white/20"
								)}
							>
								<X className="w-5 h-5" />
							</button>

							{/* Icon */}
							<div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
								<div
									className={cn(
										"w-16 h-16 rounded-2xl flex items-center justify-center",
										"bg-white dark:bg-gray-800 shadow-lg",
										"border-4 border-white dark:border-gray-900"
									)}
								>
									<Sparkles className="w-8 h-8 text-primary" />
								</div>
							</div>
						</div>

						{/* Content */}
						<div className="px-6 pt-12 pb-6 text-center">
							<h2
								id="tour-modal-title"
								className="text-2xl font-bold text-foreground mb-2"
							>
								Welcome to OneTool!
							</h2>
							<p className="text-muted-foreground mb-6">
								Let us show you around! This quick tour will help you get
								started with the key features of your dashboard.
							</p>

							{/* What you'll learn */}
							<div
								className={cn(
									"text-left rounded-xl p-4 mb-6",
									"bg-gray-50 dark:bg-gray-800/50",
									"border border-gray-100 dark:border-gray-700"
								)}
							>
								<p className="text-sm font-medium text-foreground mb-3">
									In this tour, you&apos;ll learn how to:
								</p>
								<ul className="space-y-2 text-sm text-muted-foreground">
									<li className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
										Navigate using the sidebar menu
									</li>
									<li className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
										Switch between organizations
									</li>
									<li className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
										Track your business metrics at a glance
									</li>
									<li className="flex items-center gap-2">
										<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
										Manage tasks and set revenue goals
									</li>
								</ul>
							</div>

							{/* Buttons */}
							<div className="flex flex-col gap-3">
								<StyledButton
									onClick={handleStartTour}
									intent="primary"
									size="lg"
									label="Start Tour"
									className="w-full justify-center"
								/>
								<StyledButton
									onClick={handleSkip}
									intent="plain"
									size="lg"
									label="Skip for now"
									showArrow={false}
									className="w-full justify-center"
								/>
							</div>

							{/* Don't show again checkbox */}
							<div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
								<label className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground">
									<input
										type="checkbox"
										checked={dontShowAgain}
										onChange={(e) => setDontShowAgain(e.target.checked)}
										className={cn(
											"w-4 h-4 rounded border-gray-300 dark:border-gray-600",
											"text-primary focus:ring-primary focus:ring-offset-0"
										)}
									/>
									Don&apos;t show this again
								</label>
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);

	// Use portal to render at document root
	if (typeof document !== "undefined") {
		return createPortal(modalContent, document.body);
	}

	return null;
}

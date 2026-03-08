"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring } from "motion/react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import ScheduleDemoModal from "@/app/components/landing/schedule-demo-modal";
import { Calendar, Sparkles } from "lucide-react";

const PARALLAX_INTENSITY = 20;

export default function HeroSection() {
	const [mounted, setMounted] = useState(false);
	const { resolvedTheme } = useTheme();
	const sectionRef = useRef<HTMLElement>(null);

	// Schedule Demo state
	const [isScheduleDemoOpen, setIsScheduleDemoOpen] = useState(false);

	// Parallax mouse tracking - matching template's spring config
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	const x = useSpring(mouseX, { damping: 25, stiffness: 150 });
	const y = useSpring(mouseY, { damping: 25, stiffness: 150 });

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleMouseMove = (e: ReactMouseEvent<HTMLElement>) => {
		if (!sectionRef.current) return;
		if (window.innerWidth < 850) return; // Disabled on mobile

		const rect = sectionRef.current.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		const offsetX = (e.clientX - centerX) / (rect.width / 2);
		const offsetY = (e.clientY - centerY) / (rect.height / 2);

		mouseX.set(offsetX * PARALLAX_INTENSITY);
		mouseY.set(offsetY * PARALLAX_INTENSITY);
	};

	const handleMouseLeave = () => {
		mouseX.set(0);
		mouseY.set(0);
	};

	const dashboardSrc = mounted && resolvedTheme === "dark"
		? "/Dashboard-dark.png"
		: "/Dashboard-light.png";

	return (
		<section
			id="home"
			ref={sectionRef}
			className="relative overflow-hidden"
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
		>
			{/* Background image with parallax - scale-105 ensures no edge gaps during movement */}
			{mounted && (
				<motion.div
					className="absolute inset-0 min-[850px]:inset-2.5 bg-cover bg-center bg-no-repeat -z-10 brightness-125 rounded-br-4xl rounded-bl-4xl min-[850px]:scale-105"
					style={{
						backgroundImage: "url(/BG.png)",
						x,
						y,
					}}
					aria-hidden="true"
				/>
			)}
			{/* Overlay for readability */}
			<div className="absolute inset-0 bg-white/70 dark:bg-black/70 -z-[5]" />

			{/* Content */}
			<div className="relative z-10 pt-28 sm:pt-36 lg:pt-44 pb-8 sm:pb-12">
				<div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
					{/* Badge */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.1 }}
						className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6"
					>
						<Sparkles className="h-3.5 w-3.5 text-primary" />
						<span className="text-xs font-medium text-primary">
							Now Available
						</span>
					</motion.div>

					{/* Headline */}
					<motion.h1
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.2 }}
						className="text-4xl sm:text-5xl lg:text-7xl font-semibold tracking-tight text-foreground"
					>
						Simplify Your Business
						<br />
						<span className="text-3xl sm:text-4xl lg:text-6xl">
							Manage with{" "}
							<span className="border border-dashed border-primary px-2 py-1 rounded-xl bg-primary/10 inline-block mt-2">
								Confidence
							</span>
						</span>
					</motion.h1>

					{/* Subheadline */}
					<motion.p
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.3 }}
						className="mt-6 text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto"
					>
						OneTool brings together quotes, projects, clients, and invoices
						— everything you need to keep work moving.
					</motion.p>

					{/* CTAs */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.4 }}
						className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
					>
						<AccentCTA href="/sign-up">Get Started</AccentCTA>
						<StyledButton
							intent="outline"
							size="lg"
							onClick={() => setIsScheduleDemoOpen(true)}
							icon={<Calendar className="h-4 w-4" />}
						>
							Schedule a Demo
						</StyledButton>
					</motion.div>
				</div>

				{/* Dashboard Mockup */}
				<motion.div
					initial={{ opacity: 0, y: 40 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 1, delay: 0.6, ease: [0.23, 1, 0.32, 1] }}
					className="relative mt-16 sm:mt-24 px-6"
				>
					<div className="relative max-w-5xl mx-auto">
						<div
							className="relative rounded-2xl overflow-hidden border border-border shadow-2xl/5 dark:mix-blend-darken"
							style={{
								mask: "linear-gradient(to bottom, black 50%, transparent 100%)",
								WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
							}}
						>
							<Image
								src={dashboardSrc}
								alt="OneTool Dashboard"
								width={1920}
								height={1080}
								className="w-full h-auto"
								priority
							/>
						</div>
					</div>
				</motion.div>
			</div>

			{/* Schedule Demo Modal */}
			<ScheduleDemoModal
				isOpen={isScheduleDemoOpen}
				onClose={() => setIsScheduleDemoOpen(false)}
			/>
		</section>
	);
}

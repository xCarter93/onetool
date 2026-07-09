"use client";

import { useTheme } from "next-themes";
import {
	useState,
	useRef,
	useSyncExternalStore,
	type MouseEvent as ReactMouseEvent,
} from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring } from "motion/react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import ScheduleDemoModal from "@/app/components/landing/schedule-demo-modal";
import { Calendar } from "lucide-react";

const PARALLAX_INTENSITY = 20;

const APP_STORE_URL =
	"https://apps.apple.com/us/app/onetool-small-business-crm/id6757319255";

const fanCards = [
	{
		name: "Clients",
		alt: "OneTool client management",
		rotate: -12,
		translateY: 40,
	},
	{ name: "Dashboard", alt: "OneTool dashboard", rotate: 0, translateY: 0 },
	{
		name: "Automations",
		alt: "OneTool workflow automations",
		rotate: 12,
		translateY: 40,
	},
];

const emptySubscribe = () => () => {};

export default function HeroSection() {
	// True after hydration, false on server — gates theme-dependent rendering.
	const mounted = useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
	const { resolvedTheme } = useTheme();
	const sectionRef = useRef<HTMLElement>(null);

	// Schedule Demo state
	const [isScheduleDemoOpen, setIsScheduleDemoOpen] = useState(false);

	// Parallax mouse tracking - matching template's spring config
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	const x = useSpring(mouseX, { damping: 25, stiffness: 150 });
	const y = useSpring(mouseY, { damping: 25, stiffness: 150 });

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

	const themeSuffix = mounted && resolvedTheme === "dark" ? "dark" : "light";

	// White badge reads on the dark overlay, black on the light one.
	const appStoreBadgeSrc =
		themeSuffix === "dark"
			? "/app-store-badge-white.svg"
			: "/app-store-badge-black.svg";

	// White badge reads on the dark overlay, black on the light one.
	const appStoreBadgeSrc = mounted && resolvedTheme === "dark"
		? "/app-store-badge-white.svg"
		: "/app-store-badge-black.svg";

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
						OneTool brings together quotes, projects, clients, and invoices —
						everything you need to keep work moving.
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

					{/* iOS App Store badge — smart link: opens the App Store app on iOS, the web product page on desktop */}
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.5 }}
						className="mt-6 flex justify-center"
					>
						<a
							href={APP_STORE_URL}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Download OneTool on the App Store"
							className="inline-block transition-transform hover:scale-[1.03] active:scale-[0.98]"
						>
							<Image
								src={appStoreBadgeSrc}
								alt="Download on the App Store"
								width={132}
								height={44}
								className="h-11 w-auto"
								priority
								unoptimized
							/>
						</a>
					</motion.div>
				</div>

				{/* Fanned app screenshots */}
				<div className="relative mt-16 sm:mt-24 px-6 pb-12 sm:pb-16">
					<div className="relative flex flex-row items-end justify-center -space-x-12 sm:-space-x-20 lg:-space-x-28">
						{fanCards.map((card, index) => (
							<motion.div
								key={card.name}
								className={`relative aspect-4/3 w-56 sm:w-96 md:w-120 lg:w-140 xl:w-160 origin-bottom overflow-hidden rounded-xl sm:rounded-2xl ${
									card.rotate === 0 ? "z-10" : "z-0"
								}`}
								initial={{ opacity: 0, y: 80, rotate: 0 }}
								animate={{
									opacity: 1,
									y: card.translateY,
									rotate: card.rotate,
								}}
								whileHover={{
									y: card.translateY - 12,
									transition: { type: "spring", stiffness: 400, damping: 25 },
								}}
								transition={{
									duration: 0.7,
									delay: 0.5 + index * 0.12,
									ease: [0.25, 0.46, 0.45, 0.94],
								}}
							>
								<Image
									src={`/${card.name}-${themeSuffix}.png`}
									alt={card.alt}
									fill
									sizes="(max-width: 640px) 224px, (max-width: 1024px) 480px, (max-width: 1280px) 560px, 640px"
									className="object-cover object-bottom"
									priority={card.rotate === 0}
								/>
							</motion.div>
						))}
					</div>
				</div>
			</div>

			{/* Schedule Demo Modal */}
			<ScheduleDemoModal
				isOpen={isScheduleDemoOpen}
				onClose={() => setIsScheduleDemoOpen(false)}
			/>
		</section>
	);
}

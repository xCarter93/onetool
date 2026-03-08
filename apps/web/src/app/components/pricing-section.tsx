"use client";

import {
	Briefcase,
	CheckCheck,
	Database,
	FileText,
	Server,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { AccentCTA } from "@/app/components/landing/accent-cta";
import { usePlans } from "@clerk/nextjs/experimental";
import { useRouter } from "next/navigation";

function cn(...classes: (string | undefined | null | false)[]): string {
	return classes.filter(Boolean).join(" ");
}

// Animated number component
interface AnimatedNumberProps {
	value: number;
	format: {
		style: "currency" | "decimal" | "percent";
		currency?: string;
		maximumFractionDigits: number;
	};
	className?: string;
}

const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
	value,
	format,
	className,
}) => {
	const [currentValue, setCurrentValue] = useState(0);
	const animationFrameRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);

	useEffect(() => {
		const duration = 500;

		const animate = (timestamp: DOMHighResTimeStamp) => {
			if (!startTimeRef.current) {
				startTimeRef.current = timestamp;
			}

			const progress = (timestamp - startTimeRef.current) / duration;
			const easedProgress = Math.min(1, progress);
			const newValue = easedProgress * value;
			setCurrentValue(newValue);

			if (progress < 1) {
				animationFrameRef.current = requestAnimationFrame(animate);
			} else {
				setCurrentValue(value);
				startTimeRef.current = null;
			}
		};

		if (animationFrameRef.current) {
			cancelAnimationFrame(animationFrameRef.current);
		}
		startTimeRef.current = null;
		animationFrameRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [value]);

	const formatter = new Intl.NumberFormat("en-US", {
		style: format.style,
		currency: format.currency,
		maximumFractionDigits: format.maximumFractionDigits,
	});

	return <span className={className}>{formatter.format(currentValue)}</span>;
};

const plans = [
	{
		name: "Free",
		description:
			"Perfect for individuals and small teams getting started with project management",
		price: 0,
		yearlyPrice: 0,
		buttonText: "Get started",
		buttonVariant: "outline" as const,
		features: [
			{ text: "Limited Clients (10)", icon: <Briefcase size={20} /> },
			{
				text: "Limited Active Projects per client (3)",
				icon: <Database size={20} />,
			},
			{ text: "5 E-signature requests per month", icon: <Server size={20} /> },
			{
				text: "Custom Invoice & Quote PDF Generation",
				icon: <FileText size={20} />,
			},
		],
		includes: [],
	},
	{
		name: "Business",
		description:
			"Best value for growing businesses that need advanced features and unlimited access",
		price: 30,
		yearlyPrice: 300,
		buttonText: "Get started",
		buttonVariant: "default" as const,
		popular: true,
		features: [
			{ text: "Unlimited Clients", icon: <Briefcase size={20} /> },
			{
				text: "Unlimited Active Projects per Client",
				icon: <Database size={20} />,
			},
			{
				text: "Unlimited E-signature requests per month",
				icon: <Server size={20} />,
			},
		],
		includes: [
			"Everything in Free, plus:",
			"Custom SKU Creation",
			"Unlimited Saved Organization Documents",
			"AI Import for Existing Clients/Projects",
			"Stripe Connect Integration - Send & Receive Payments",
			"Priority Support - 24 hour SLAs",
		],
	},
];

const PricingSwitch = ({ onSwitch }: { onSwitch: (value: string) => void }) => {
	const [selected, setSelected] = useState("0");

	const handleSwitch = (value: string) => {
		setSelected(value);
		onSwitch(value);
	};

	return (
		<div className="flex justify-center">
			<div className="relative z-50 mx-auto flex w-fit rounded-full bg-muted/30 border border-border p-1">
				<button
					onClick={() => handleSwitch("0")}
					className={cn(
						"relative z-10 w-fit sm:h-12 h-10 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
						selected === "0"
							? "text-white"
							: "text-muted-foreground hover:text-foreground"
					)}
				>
					{selected === "0" && (
						<motion.span
							layoutId="switch"
							className="absolute top-0 left-0 sm:h-12 h-10 w-full rounded-full border-4 shadow-sm shadow-primary border-primary bg-linear-to-t from-primary via-primary/80 to-primary"
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
						/>
					)}
					<span className="relative">Monthly</span>
				</button>

				<button
					onClick={() => handleSwitch("1")}
					className={cn(
						"relative z-10 w-fit sm:h-12 h-10 shrink-0 rounded-full sm:px-6 px-3 sm:py-2 py-1 font-medium transition-colors",
						selected === "1"
							? "text-white"
							: "text-muted-foreground hover:text-foreground"
					)}
				>
					{selected === "1" && (
						<motion.span
							layoutId="switch"
							className="absolute top-0 left-0 sm:h-12 h-10 w-full rounded-full border-4 shadow-sm shadow-primary border-primary bg-linear-to-t from-primary via-primary/80 to-primary"
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
						/>
					)}
					<span className="relative flex items-center gap-2">
						Yearly
						<span className="rounded-full bg-white dark:bg-gray-900 px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
							Save 17%
						</span>
					</span>
				</button>
			</div>
		</div>
	);
};

export default function PricingSection() {
	const [isYearly, setIsYearly] = useState(false);
	const [mounted, setMounted] = useState(false);
	const { resolvedTheme } = useTheme();
	const router = useRouter();

	const { data: clerkPlans, isLoading: isLoadingPlans } = usePlans({
		for: "organization",
		enabled: true,
	});

	useEffect(() => {
		setMounted(true);
	}, []);

	const getDisplayPlans = () => {
		const freePlan = plans.find((p) => p.name === "Free");
		const displayPlans = freePlan ? [freePlan] : [];

		if (!isLoadingPlans && clerkPlans && clerkPlans.length > 0) {
			const clerkDisplayPlans = clerkPlans
				.filter((clerkPlan) => clerkPlan.hasBaseFee)
				.map((clerkPlan) => {
					const hardcodedPlan = plans.find(
						(p) =>
							p.name.toLowerCase() === clerkPlan.name.toLowerCase() ||
							p.name === "Business"
					);

					const monthlyPrice = clerkPlan.fee?.amount
						? clerkPlan.fee.amount / 100
						: hardcodedPlan?.price ?? 0;
					const yearlyPrice = clerkPlan.annualFee?.amount
						? clerkPlan.annualFee.amount / 100
						: hardcodedPlan?.yearlyPrice ?? 0;

					return {
						name: clerkPlan.name,
						description:
							clerkPlan.description || hardcodedPlan?.description || "",
						price: monthlyPrice,
						yearlyPrice: yearlyPrice,
						buttonText: hardcodedPlan?.buttonText || "Get started",
						buttonVariant: (hardcodedPlan?.buttonVariant || "default") as
							| "default"
							| "outline",
						popular: hardcodedPlan?.popular,
						features: hardcodedPlan?.features || [],
						includes: hardcodedPlan?.includes || [],
						clerkPlanId: clerkPlan.id,
					} as const;
				});

			displayPlans.push(...(clerkDisplayPlans as typeof displayPlans));
		} else {
			const businessPlan = plans.find((p) => p.name === "Business");
			if (businessPlan) {
				displayPlans.push(businessPlan);
			}
		}

		return displayPlans;
	};

	const displayPlans = getDisplayPlans();

	const handleGetStarted = () => {
		router.push("/sign-up");
	};

	if (!mounted || !resolvedTheme) {
		return null;
	}

	const togglePricingPeriod = (value: string) =>
		setIsYearly(Number.parseInt(value) === 1);

	return (
		<section
			id="pricing"
			className="py-24 sm:py-32 lg:py-40 px-4 sm:px-6 lg:px-8"
		>
			<div className="mx-auto max-w-5xl">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-8 sm:mb-12"
				>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground mb-4">
						Plans that work best for your{" "}
						<span className="border border-dashed border-primary px-2 py-1 rounded-xl bg-primary/10 inline-block">
							business
						</span>
					</h2>
					<p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
						We help teams all around the world. Explore which option is right for
						you.
					</p>
				</motion.div>

				{/* Switch */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.1 }}
					className="mb-10"
				>
					<PricingSwitch onSwitch={togglePricingPeriod} />
				</motion.div>

				{/* Plan Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{displayPlans.map((plan, index) => (
						<motion.div
							key={plan.name}
							initial={{ opacity: 0, y: 30 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.15 * index }}
							className="relative"
						>
							{/* Popular badge wrapper */}
							{plan.popular && (
								<div className="absolute -inset-[3px] rounded-[1.2rem] bg-primary z-0" />
							)}
							{plan.popular && (
								<div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
									<span className="bg-primary text-white px-4 py-1 rounded-full text-xs font-medium whitespace-nowrap">
										Most Popular
									</span>
								</div>
							)}

							<div
								className={cn(
									"relative z-[1] h-full rounded-2xl bg-white dark:bg-black border border-border p-6 sm:p-8",
									plan.popular && "border-transparent"
								)}
							>
								{/* Plan header */}
								<h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2">
									{plan.name}
								</h3>
								<p className="text-sm text-muted-foreground mb-4">
									{plan.description}
								</p>

								{/* Price */}
								<div className="flex items-baseline mb-1">
									<span className="text-3xl sm:text-4xl font-semibold text-foreground">
										$
										<AnimatedNumber
											value={isYearly ? plan.yearlyPrice : plan.price}
											className="text-3xl sm:text-4xl font-semibold"
											format={{
												style: "decimal",
												maximumFractionDigits: 0,
											}}
										/>
									</span>
									<span className="text-sm text-muted-foreground ml-1">
										/{isYearly ? "year" : "month"}
									</span>
								</div>
								{plan.price > 0 && (
									<p className="text-xs text-muted-foreground mb-6">
										Per organization · Unlimited users included
									</p>
								)}
								{plan.price === 0 && <div className="mb-6" />}

								{/* Features */}
								<ul className="space-y-2.5 mb-6">
									{plan.features.map((feature, featureIndex) => (
										<li key={featureIndex} className="flex items-start">
											<span className="text-foreground grid place-content-center mt-0.5 mr-3 shrink-0 [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
												{feature.icon}
											</span>
											<span className="text-sm text-muted-foreground">
												{feature.text}
											</span>
										</li>
									))}
								</ul>

								{/* Includes */}
								{plan.includes.length > 0 && (
									<div className="pt-4 border-t border-border">
										<h4 className="font-medium text-sm text-foreground mb-3">
											{plan.includes[0]}
										</h4>
										<ul className="space-y-2.5">
											{plan.includes.slice(1).map((feature, featureIndex) => (
												<li key={featureIndex} className="flex items-start">
													<span className="h-5 w-5 bg-primary/10 border border-primary rounded-full grid place-content-center mt-0.5 mr-3 shrink-0">
														<CheckCheck className="h-3 w-3 text-primary" />
													</span>
													<span className="text-sm text-muted-foreground">
														{feature}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</motion.div>
					))}
				</div>

				{/* CTA */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.3 }}
					className="flex justify-center mt-10"
				>
					<AccentCTA onClick={handleGetStarted}>
						Get Started
					</AccentCTA>
				</motion.div>
			</div>
		</section>
	);
}

"use client";

import {
	Briefcase,
	CheckCheck,
	Database,
	FileText,
	Server,
} from "lucide-react";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { m, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { CtaButton } from "@/app/components/landing/cta-button";
import { revealProps } from "@/app/components/landing/motion-utils";
import { usePlans } from "@clerk/nextjs/experimental";
import { useRouter } from "next/navigation";

function cn(...classes: (string | undefined | null | false)[]): string {
	return classes.filter(Boolean).join(" ");
}

const emptySubscribe = () => () => {};

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
	const reduced = useReducedMotion();

	const handleSwitch = (value: string) => {
		setSelected(value);
		onSwitch(value);
	};

	const isYearly = selected === "1";

	return (
		<div
			role="radiogroup"
			aria-label="Billing period"
			className="inline-flex flex-wrap items-center gap-4"
		>
			<div className="relative inline-flex h-11 items-center rounded-lg border border-bp-line bg-muted p-1">
				{/* Transform-only thumb — no layout animation, so nothing reflows. */}
				<span
					aria-hidden="true"
					className={cn(
						"absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-md bg-(--cta-solid) transition-transform ease-out",
						reduced ? "duration-0" : "duration-300",
						isYearly ? "translate-x-full" : "translate-x-0",
					)}
				/>
				{(["0", "1"] as const).map((value) => {
					const active = selected === value;
					return (
						<button
							key={value}
							type="button"
							role="radio"
							aria-checked={active}
							onClick={() => handleSwitch(value)}
							className={cn(
								"relative z-10 inline-flex h-9 shrink-0 items-center justify-center rounded-md px-4 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] transition-colors",
								active
									? "text-white"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{value === "0" ? "Monthly" : "Yearly"}
						</button>
					);
				})}
			</div>
			<span
				className={cn(
					"text-[11px] font-semibold uppercase leading-none tracking-[0.14em] transition-opacity",
					isYearly ? "text-foreground" : "text-muted-foreground opacity-70",
				)}
			>
				Save 17%
			</span>
		</div>
	);
};

export default function PricingSection() {
	const [isYearly, setIsYearly] = useState(false);
	// True after hydration, false on server — gates theme-dependent rendering.
	const mounted = useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
	const { resolvedTheme } = useTheme();
	const router = useRouter();
	const reduced = useReducedMotion();

	const { data: clerkPlans, isLoading: isLoadingPlans } = usePlans({
		for: "organization",
		enabled: true,
	});

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
							p.name === "Business",
					);

					const monthlyPrice = clerkPlan.fee?.amount
						? clerkPlan.fee.amount / 100
						: (hardcodedPlan?.price ?? 0);
					const yearlyPrice = clerkPlan.annualFee?.amount
						? clerkPlan.annualFee.amount / 100
						: (hardcodedPlan?.yearlyPrice ?? 0);

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
		<section id="pricing" className="relative p-6 sm:p-10 lg:p-14">
			{/* Header — heading left, billing toggle right, on a shared baseline. */}
			<m.div
				{...revealProps(reduced)}
				className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
			>
				<div className="max-w-xl">
					<h2 className="text-balance text-2xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-3xl lg:text-[2.5rem]">
						Plans that work best for your Business
					</h2>
					<p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
						We help teams all around the world. Explore which option is right
						for you.
					</p>
				</div>

				<PricingSwitch onSwitch={togglePricingPeriod} />
			</m.div>

			{/* Plan Cards */}
			<div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:mt-16 lg:gap-6">
				{displayPlans.map((plan, index) => (
					<m.div
						key={plan.name}
						{...revealProps(reduced, { y: 30, delay: 0.15 * index })}
						className={cn(
							"relative",
							// Column rule in the gutter, not on the plate edge.
							index > 0 &&
								"md:before:absolute md:before:-left-2 md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-bp-line md:before:content-[''] lg:before:-left-3",
						)}
					>
						<div
							className={cn(
								"relative h-full border border-bp-line p-6 sm:p-8",
								plan.popular
									? "bg-muted shadow-[0_10px_28px_-22px_rgba(0,0,0,0.25)]"
									: "bg-bp-paper",
							)}
						>
							{/* Plan header */}
							<div className="flex items-start justify-between gap-4">
								<h3 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2">
									{plan.name}
								</h3>
								{plan.popular && (
									<span className="shrink-0 border border-bp-line-strong px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-foreground">
										Most Popular
									</span>
								)}
							</div>
							<p className="text-sm text-muted-foreground mb-4">
								{plan.description}
							</p>

							{/* Price */}
							<div className="flex items-baseline mb-1">
								<span className="text-3xl sm:text-4xl font-semibold tabular-nums text-foreground">
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
								<div className="pt-4 border-t border-bp-line">
									<h4 className="font-medium text-sm text-foreground mb-3">
										{plan.includes[0]}
									</h4>
									<ul className="space-y-2.5">
										{plan.includes.slice(1).map((feature, featureIndex) => (
											<li key={featureIndex} className="flex items-start">
												<span className="h-5 w-5 border border-bp-line-strong grid place-content-center mt-0.5 mr-3 shrink-0">
													<CheckCheck className="h-3 w-3 text-foreground" />
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
					</m.div>
				))}
			</div>

			{/* CTA */}
			<m.div
				{...revealProps(reduced, { delay: 0.3 })}
				className="mt-12 flex lg:mt-16"
			>
				<CtaButton onClick={handleGetStarted}>Get Started</CtaButton>
			</m.div>
		</section>
	);
}

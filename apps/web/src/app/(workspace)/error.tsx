"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
	StyledCard,
	StyledCardContent,
	StyledCardFooter,
	StyledCardHeader,
	StyledCardTitle,
	StyledCardDescription,
} from "@/components/ui/styled/styled-card";

const LOOP_DURATION = 4;

const Band = ({ delay }: { delay: number }) => {
	return (
		<motion.span
			style={{
				translateX: "-50%",
				translateY: "-50%",
			}}
			initial={{
				opacity: 0,
				scale: 0.25,
			}}
			animate={{
				opacity: [0, 1, 1, 0],
				scale: 1,
			}}
			transition={{
				repeat: Infinity,
				repeatType: "loop",
				times: [0, 0.5, 0.75, 1],
				duration: LOOP_DURATION,
				ease: "linear",
				delay,
			}}
			className="absolute left-[50%] top-[50%] z-0 h-32 w-32 rounded-full border border-red-500/30 bg-linear-to-br from-red-500/20 to-red-800/5 shadow-xl shadow-red-500/20"
		/>
	);
};

const Logo = () => {
	return (
		<motion.div
			className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm"
			initial={{
				opacity: 0,
				scale: 0.85,
			}}
			animate={{
				opacity: 1,
				scale: 1,
			}}
			transition={{
				duration: 1,
				ease: "easeOut",
			}}
		>
			<AlertCircle className="h-8 w-8" />
		</motion.div>
	);
};

const Ping = () => {
	return (
		<div className="relative flex items-center justify-center py-8">
			<Logo />
			<Band delay={0} />
			<Band delay={LOOP_DURATION * 0.25} />
			<Band delay={LOOP_DURATION * 0.5} />
			<Band delay={LOOP_DURATION * 0.75} />
		</div>
	);
};

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const router = useRouter();

	useEffect(() => {
		// Log the error to PostHog
		posthog.captureException(error);
	}, [error]);

	return (
		<div className="flex h-[80vh] w-full items-center justify-center p-6">
			<StyledCard className="w-full max-w-xl overflow-visible">
				<StyledCardHeader className="text-center pb-2 relative z-10">
					<div className="mx-auto mb-2">
						<Ping />
					</div>
					<StyledCardTitle className="text-2xl mt-4">
						Something went wrong!
					</StyledCardTitle>
					<StyledCardDescription className="text-base">
						We apologize for the inconvenience. Our team has been notified of
						this issue.
					</StyledCardDescription>
				</StyledCardHeader>
				<StyledCardContent className="text-center pb-2 relative z-10">
					<div className="rounded-md bg-muted/50 p-4 mb-4 backdrop-blur-sm">
						<p className="text-sm font-medium text-foreground">
							{error.message || "An unexpected error occurred"}
						</p>
						{error.digest && (
							<p className="mt-1 text-xs text-muted-foreground font-mono">
								Error ID: {error.digest}
							</p>
						)}
					</div>
				</StyledCardContent>
				<StyledCardFooter className="flex justify-center gap-4 pb-8 relative z-10">
					<Button
						onClick={() => reset()}
						variant="default"
						size="lg"
						className="px-8"
					>
						Try again
					</Button>
					<Button
						onClick={() => router.push("/home")}
						variant="outline"
						size="lg"
						className="px-8"
					>
						Back to Home
					</Button>
				</StyledCardFooter>
			</StyledCard>
		</div>
	);
}

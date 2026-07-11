"use client";

import * as React from "react";
import {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardAction,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * GlassCard - A wrapper around the base Card component with consistent glassmorphism styling
 */
export function GlassCard({
	className,
	children,
	...props
}: React.ComponentProps<typeof Card>) {
	return (
		<Card
			className={cn(
				"group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40",
				className
			)}
			{...props}
		>
			{/* Glassmorphism gradient overlay */}
			<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl pointer-events-none" />
			<div className="relative z-10">{children}</div>
		</Card>
	);
}

export function GlassCardHeader({
	className,
	...props
}: React.ComponentProps<typeof CardHeader>) {
	return <CardHeader className={cn("relative z-10", className)} {...props} />;
}

export function GlassCardTitle({
	className,
	...props
}: React.ComponentProps<typeof CardTitle>) {
	return <CardTitle className={cn("relative z-10", className)} {...props} />;
}

export function GlassCardDescription({
	className,
	...props
}: React.ComponentProps<typeof CardDescription>) {
	return (
		<CardDescription className={cn("relative z-10", className)} {...props} />
	);
}

export function GlassCardContent({
	className,
	...props
}: React.ComponentProps<typeof CardContent>) {
	return <CardContent className={cn("relative z-10", className)} {...props} />;
}

export function GlassCardFooter({
	className,
	...props
}: React.ComponentProps<typeof CardFooter>) {
	return <CardFooter className={cn("relative z-10", className)} {...props} />;
}

export function GlassCardAction({
	className,
	...props
}: React.ComponentProps<typeof CardAction>) {
	return <CardAction className={cn("relative z-10", className)} {...props} />;
}

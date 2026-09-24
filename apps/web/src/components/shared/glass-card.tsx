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

export function GlassCard({
	className,
	children,
	...props
}: React.ComponentProps<typeof Card>) {
	return (
		<Card
			className={cn("group relative rounded-lg border border-border bg-card shadow-none ring-0", className)}
			{...props}
		>
			<div>{children}</div>
		</Card>
	);
}

export function GlassCardHeader({
	className,
	...props
}: React.ComponentProps<typeof CardHeader>) {
	return <CardHeader className={className} {...props} />;
}

export function GlassCardTitle({
	className,
	...props
}: React.ComponentProps<typeof CardTitle>) {
	return <CardTitle className={className} {...props} />;
}

export function GlassCardDescription({
	className,
	...props
}: React.ComponentProps<typeof CardDescription>) {
	return (
		<CardDescription className={className} {...props} />
	);
}

export function GlassCardContent({
	className,
	...props
}: React.ComponentProps<typeof CardContent>) {
	return <CardContent className={className} {...props} />;
}

export function GlassCardFooter({
	className,
	...props
}: React.ComponentProps<typeof CardFooter>) {
	return <CardFooter className={className} {...props} />;
}

export function GlassCardAction({
	className,
	...props
}: React.ComponentProps<typeof CardAction>) {
	return <CardAction className={className} {...props} />;
}

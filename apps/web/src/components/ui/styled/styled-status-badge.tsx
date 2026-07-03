"use client";

import * as React from "react";
import { Badge, type BadgeProps } from "@/components/reui/badge";
import { cn } from "@/lib/utils";

/**
 * StyledStatusBadge - the single status-pill component for the app.
 * Wraps the ReUI Badge (components/reui/badge.tsx — vendor layer, do not edit)
 * and maps OneTool domain statuses onto the semantic status tokens
 * (--success / --warning / --danger / --info) defined in globals.css.
 */

export type StatusRole = "success" | "warning" | "danger" | "info" | "neutral";

export type StatusKey =
	| "active"
	| "completed"
	| "approved"
	| "paid"
	| "in-progress"
	| "pending"
	| "cancelled"
	| "overdue"
	| "declined"
	| "lead"
	| "planned"
	| "scheduled"
	| "sent"
	| "inactive"
	| "archived"
	| "draft"
	| "expired"
	| "refunded";

const STATUS_ROLE: Record<StatusKey, StatusRole> = {
	active: "success",
	completed: "success",
	approved: "success",
	paid: "success",
	"in-progress": "warning",
	pending: "warning",
	cancelled: "danger",
	overdue: "danger",
	declined: "danger",
	lead: "info",
	planned: "info",
	scheduled: "info",
	sent: "info",
	inactive: "neutral",
	archived: "neutral",
	draft: "neutral",
	expired: "neutral",
	refunded: "neutral",
};

export function statusRole(status: string): StatusRole {
	return STATUS_ROLE[status as StatusKey] ?? "neutral";
}

type Appearance = "soft" | "solid" | "outline";

const ROLE_VARIANT: Record<
	StatusRole,
	Record<Appearance, BadgeProps["variant"]>
> = {
	success: {
		soft: "success-light",
		solid: "success",
		outline: "success-outline",
	},
	warning: {
		soft: "warning-light",
		solid: "warning",
		outline: "warning-outline",
	},
	danger: {
		soft: "destructive-light",
		solid: "destructive",
		outline: "destructive-outline",
	},
	info: { soft: "info-light", solid: "info", outline: "info-outline" },
	neutral: { soft: "secondary", solid: "invert", outline: "outline" },
};

export interface StyledStatusBadgeProps
	extends Omit<BadgeProps, "variant"> {
	/** Domain status string (e.g. "paid", "overdue"); unknown values render neutral. */
	status?: string;
	/** Explicit semantic role; overrides `status` when provided. */
	role?: StatusRole;
	appearance?: Appearance;
}

export function StyledStatusBadge({
	status,
	role,
	appearance = "soft",
	radius = "full",
	className,
	...props
}: StyledStatusBadgeProps) {
	const resolved = role ?? statusRole(status ?? "");
	return (
		<Badge
			variant={ROLE_VARIANT[resolved][appearance]}
			radius={radius}
			className={cn("transition-all duration-200", className)}
			{...props}
		/>
	);
}

/**
 * Plan limits and feature configuration for OneTool
 *
 * Defines the limits and features available for different subscription tiers
 */

import {
	FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	FREE_MAX_CLIENTS,
} from "@onetool/backend/convex/lib/planLimits";

export type PlanType = "free" | "premium";

export interface PlanLimits {
	clients: number | "unlimited";
	activeProjectsPerClient: number | "unlimited";
	esignaturesPerMonth: number | "unlimited";
	canCreateCustomSkus: boolean;
	canSaveOrganizationDocuments: boolean;
	canUseAiImport: boolean;
	canUseAiAssistant: boolean;
	supportSla: string;
}

/**
 * Free plan limits - for users without premium_feature_access
 */
export const FREE_PLAN_LIMITS: PlanLimits = {
	clients: FREE_MAX_CLIENTS,
	activeProjectsPerClient: FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT,
	esignaturesPerMonth: 5,
	canCreateCustomSkus: false,
	canSaveOrganizationDocuments: false,
	canUseAiImport: false,
	// Enforced server-side too: hasPremiumAccess in convex/lib/permissions.ts.
	canUseAiAssistant: false,
	supportSla: "Best effort",
};

/**
 * Premium plan limits - for users with premium_feature_access feature
 */
export const PREMIUM_PLAN_LIMITS: PlanLimits = {
	clients: "unlimited",
	activeProjectsPerClient: "unlimited",
	esignaturesPerMonth: "unlimited",
	canCreateCustomSkus: true,
	canSaveOrganizationDocuments: true,
	canUseAiImport: true,
	canUseAiAssistant: true,
	supportSla: "24 hours",
};

/**
 * Get plan limits based on whether user has premium access
 */
export function getPlanLimits(hasPremiumAccess: boolean): PlanLimits {
	return hasPremiumAccess ? PREMIUM_PLAN_LIMITS : FREE_PLAN_LIMITS;
}

/**
 * Check if a limit is unlimited
 */
export function isUnlimited(limit: number | "unlimited"): limit is "unlimited" {
	return limit === "unlimited";
}

/**
 * Check if usage is at or over limit
 */
export function isAtLimit(usage: number, limit: number | "unlimited"): boolean {
	if (isUnlimited(limit)) {
		return false;
	}
	return usage >= limit;
}

/**
 * Check if usage is close to limit (within 80%)
 */
export function isNearLimit(
	usage: number,
	limit: number | "unlimited"
): boolean {
	if (isUnlimited(limit)) {
		return false;
	}
	return usage >= limit * 0.8;
}

/**
 * Format limit for display
 */
export function formatLimit(limit: number | "unlimited"): string {
	return isUnlimited(limit) ? "Unlimited" : limit.toString();
}

/**
 * Get usage percentage (returns 0 for unlimited)
 */
export function getUsagePercentage(
	usage: number,
	limit: number | "unlimited"
): number {
	if (isUnlimited(limit)) {
		return 0;
	}
	return Math.min(100, (usage / limit) * 100);
}

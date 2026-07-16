/**
 * Shared utilities that are truly reusable across all document types
 * Only contains table-agnostic helper functions
 */
import { applyDiscount, calculateTax, formatCurrency } from "./money";

/**
 * Generate a random public token for public access
 * Used by quotes and invoices for client-facing URLs
 * Uses cryptographically secure random generation
 */
export function generatePublicToken(): string {
	// Use Web Crypto API for cryptographically secure random generation
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
		""
	);
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
	/**
	 * Validate email format
	 */
	isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	},

	/**
	 * Validate phone number (basic format)
	 */
	isValidPhone(phone: string): boolean {
		const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
		return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 10;
	},

	/**
	 * Sanitize string input
	 */
	sanitizeString(input: string): string {
		return input.trim().replace(/\s+/g, " ");
	},
};

/**
 * Common date utilities
 */
export const DateUtils = {
	/**
	 * Get start of day timestamp
	 */
	startOfDay(timestamp: number): number {
		const date = new Date(timestamp);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
	},

	/**
	 * Get end of day timestamp
	 */
	endOfDay(timestamp: number): number {
		const date = new Date(timestamp);
		date.setHours(23, 59, 59, 999);
		return date.getTime();
	},

	/**
	 * Add days to timestamp
	 */
	addDays(timestamp: number, days: number): number {
		return timestamp + days * 24 * 60 * 60 * 1000;
	},

	/**
	 * Check if timestamp is within the last N days
	 */
	isWithinLastDays(timestamp: number, days: number): boolean {
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		return timestamp > cutoff;
	},

	/**
	 * Convert a timestamp to a local date string (YYYY-MM-DD) in the specified timezone
	 * Falls back to UTC if no timezone is provided
	 */
	toLocalDateString(timestamp: number, timezone?: string): string {
		const date = new Date(timestamp);

		if (!timezone) {
			// Fallback to UTC
			return date.toISOString().split("T")[0];
		}

		try {
			// Use Intl.DateTimeFormat to get the date in the specified timezone
			const formatter = new Intl.DateTimeFormat("en-CA", {
				timeZone: timezone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			});

			// Format returns "YYYY-MM-DD" which is exactly what we need
			return formatter.format(date);
		} catch {
			// If timezone is invalid, fall back to UTC
			console.error(`Invalid timezone: ${timezone}, falling back to UTC`);
			return date.toISOString().split("T")[0];
		}
	},

	/**
	 * Get start of month timestamp in a specific timezone
	 * Note: This is a simplified approach that may not be perfectly accurate for all edge cases
	 */
	startOfMonthInTimezone(timezone?: string): number {
		const now = new Date();

		if (!timezone) {
			// UTC
			const startOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
			);
			return startOfMonth.getTime();
		}

		try {
			// This is a simplified approach - we'll use Date constructor with timezone context
			const targetDate = new Date(
				new Date().toLocaleString("en-US", { timeZone: timezone })
			);
			targetDate.setDate(1);
			targetDate.setHours(0, 0, 0, 0);

			return targetDate.getTime();
		} catch {
			console.error(
				`Error calculating start of month for timezone: ${timezone}`
			);
			const startOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
			);
			return startOfMonth.getTime();
		}
	},
};

/**
 * Common business logic helpers
 */
export const BusinessUtils = {
	/**
	 * Calculate percentage
	 */
	calculatePercentage(part: number, total: number): number {
		if (total === 0) return 0;
		return Math.round((part / total) * 100);
	},

	/**
	 * Format currency (delegates to lib/money.ts — amounts are dollars)
	 */
	formatCurrency(amount: number, currency = "USD"): string {
		return formatCurrency(amount, currency);
	},

	/**
	 * Calculate tax amount (delegates to lib/money.ts)
	 */
	calculateTax(subtotal: number, taxRate: number): number {
		return calculateTax(subtotal, taxRate);
	},

	/**
	 * Apply discount (delegates to lib/money.ts)
	 */
	applyDiscount(
		amount: number,
		discount: number,
		isPercentage: boolean
	): number {
		return applyDiscount(amount, discount, isPercentage);
	},
};

/**
 * PostHog feature flag keys.
 *
 * Keys live here so the browser hook, the server evaluation helper, and the
 * PostHog dashboard can't drift apart on a typo — an unknown key evaluates to
 * `undefined`, which every caller reads as "off".
 */

/**
 * Gates the whole QuickBooks Online integration: connecting, syncing, and the
 * customer import. Held off while Intuit production approval is pending.
 * Flag: https://us.posthog.com/project/265773/feature_flags/808384
 */
export const FLAG_QUICKBOOKS = "quickbooks-integration";

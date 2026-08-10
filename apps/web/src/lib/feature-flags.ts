/**
 * PostHog feature flag keys.
 *
 * Keys live here so the browser hook, the server evaluation helper, and the
 * PostHog dashboard can't drift apart on a typo — an unknown key evaluates to
 * `undefined`, which every caller reads as "off".
 */

/**
 * Gates the whole QuickBooks Online integration: connecting, syncing, and the
 * customer import. Rolled out to 100% of users on 2026-08-10; kept as a kill
 * switch, so the off-state UI below it is still reachable.
 * Flag: https://us.posthog.com/project/265773/feature_flags/808384
 */
export const FLAG_QUICKBOOKS = "quickbooks-integration";

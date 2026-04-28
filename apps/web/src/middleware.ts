import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { portalMiddleware } from "@/lib/portal/middleware";

// [Review fix #13] Portal routes must NEVER enter clerkMiddleware. Path-dispatch
// before Clerk's request-context machinery runs proves architectural isolation.
//
// [Review fix Greptile-P1] Anchor the matchers so `(.*)` only follows a `/`
// segment boundary. The previous `/portal(.*)` form matched `/portal-anything`
// (e.g. a hypothetical `/portal-settings` workspace route), silently bypassing
// Clerk and redirecting unauthenticated callers to the OTP verify page instead
// of sign-in. No such routes exist today, but the pattern is a latent footgun.
const isPortalRoute = createRouteMatcher([
	"/portal",
	"/portal/(.*)",
	"/api/portal/(.*)",
	"/.well-known/portal-jwks.json",
]);

const isPublicRoute = createRouteMatcher([
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/api/clerk-users-webhook(.*)",
	"/api/stripe-webhook(.*)",
	"/api/pay(.*)",
	"/pay(.*)",
	"/api/unsplash(.*)",
	"/api/schedule-demo(.*)",
	"/",
	"/privacy-policy",
	"/terms-of-service",
	"/data-security",
	"/communities(.*)", // Public community pages
	"/api/communities(.*)", // Public community API routes
]);

const clerkHandler = clerkMiddleware(async (auth, request) => {
	const { userId, redirectToSignIn, orgRole, sessionClaims, orgId } =
		await auth();

	// If not logged in and not a public route, redirect to sign in
	if (!isPublicRoute(request) && !userId) {
		return redirectToSignIn();
	}

	// Handle logged-in users
	if (userId) {
		const pathname = request.nextUrl.pathname;

		// Check if user has an organization
		const hasOrganization = !!orgId;

		// Check if user is an admin (role contains "admin")
		const role = orgRole || sessionClaims?.org_role;
		const isAdmin = role ? String(role).toLowerCase().includes("admin") : false;

		// If user has no organization and tries to access workspace routes, redirect to org creation
		if (
			!hasOrganization &&
			!pathname.startsWith("/organization/") &&
			!pathname.startsWith("/sign-") &&
			!isPublicRoute(request)
		) {
			const redirectUrl = request.nextUrl.clone();
			redirectUrl.pathname = "/organization/complete";
			return NextResponse.redirect(redirectUrl);
		}

		// Redirect from root based on organization status and role
		if (pathname === "/") {
			const redirectUrl = request.nextUrl.clone();

			if (!hasOrganization) {
				// No organization exists - send to organization creation
				redirectUrl.pathname = "/organization/complete";
			} else if (!isAdmin) {
				// Has organization but not an admin - send to projects
				redirectUrl.pathname = "/projects";
			} else {
				// Has organization and is an admin - send to home
				redirectUrl.pathname = "/home";
			}

			return NextResponse.redirect(redirectUrl);
		}

		// Prevent members from accessing /home
		if (!isAdmin && pathname === "/home") {
			const redirectUrl = request.nextUrl.clone();
			redirectUrl.pathname = "/projects";
			return NextResponse.redirect(redirectUrl);
		}
	}
});

// [Review fix #13] PATH DISPATCH BEFORE CLERK. Portal routes do NOT enter
// clerkMiddleware at all. This guarantees Clerk's request-context construction
// never runs for portal routes — proving architectural isolation rather than
// relying on an in-callback early return.
export default async function middleware(request: NextRequest) {
	if (isPortalRoute(request)) {
		return portalMiddleware(request);
	}
	// For all other paths, hand off to the Clerk-wrapped handler (preserves all current behavior)
	return clerkHandler(request, { waitUntil: () => {} } as never);
}

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};

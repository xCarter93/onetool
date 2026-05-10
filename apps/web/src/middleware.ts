import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { portalMiddleware } from "@/lib/portal/middleware";

// Portal routes use separate OTP/JWT auth and must not enter Clerk middleware.
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

export default async function middleware(request: NextRequest) {
	if (isPortalRoute(request)) {
		return portalMiddleware(request);
	}
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

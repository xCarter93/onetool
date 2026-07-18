import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp, hashIp } from "@/lib/portal/ip";

// PUB-19: no in-memory rate limiting here — it is per-process and useless on
// serverless. Convex's rateLimiter inside submitInterest is the real control;
// this route feeds it a trusted server-derived IP hash for the per-IP bucket.

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { slug, name, email, phone, message, website } = body;

		// Validate required fields
		if (!slug || typeof slug !== "string") {
			return NextResponse.json(
				{ error: "Community page slug is required" },
				{ status: 400 }
			);
		}

		if (!name || typeof name !== "string" || name.trim().length < 2) {
			return NextResponse.json(
				{ error: "Name is required (at least 2 characters)" },
				{ status: 400 }
			);
		}

		if (!email || typeof email !== "string") {
			return NextResponse.json(
				{ error: "Email is required" },
				{ status: 400 }
			);
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return NextResponse.json(
				{ error: "Invalid email address" },
				{ status: 400 }
			);
		}

		// Validate phone format if provided
		if (phone && typeof phone === "string" && phone.trim().length > 0) {
			// Allow various phone formats but require at least 7 digits
			const digitsOnly = phone.replace(/\D/g, "");
			if (digitsOnly.length < 7 || digitsOnly.length > 15) {
				return NextResponse.json(
					{ error: "Invalid phone number" },
					{ status: 400 }
				);
			}
		}

		const ipHash = await hashIp(getRequestIp(request));

		const client = getConvexClient();
		await client.mutation(api.communityPages.submitInterest, {
			slug: slug.trim(),
			name: name.trim(),
			email: email.trim().toLowerCase(),
			phone: phone?.trim() || undefined,
			message: message?.trim() || undefined,
			// PUB-18: honeypot passthrough — the mutation drops non-empty values
			website: typeof website === "string" ? website : undefined,
			// PUB-19: per-IP throttle key (server-derived, not client-supplied)
			ipHash,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Submission failed";

		// Don't expose internal errors to clients
		if (message.includes("Community page not found")) {
			return NextResponse.json(
				{ error: "Community page not found" },
				{ status: 404 }
			);
		}

		console.error("Interest form submission error:", error);
		return NextResponse.json(
			{ error: "Something went wrong. Please try again." },
			{ status: 500 }
		);
	}
}

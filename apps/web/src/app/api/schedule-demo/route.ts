import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp, hashIp } from "@/lib/portal/ip";
import { ScheduleDemoRequestEmail } from "@/emails/schedule-demo-request";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
	try {
		// PUB-12: this route is fully public and sends real email; throttle per IP.
		const rateLimit = await getConvexClient().mutation(
			api.payments.checkScheduleDemoRateLimit,
			{ ip: await hashIp(getRequestIp(request)) }
		);
		if (!rateLimit.ok) {
			return NextResponse.json(
				{ error: "Too many requests. Please try again later." },
				{ status: 429 }
			);
		}

		const body = await request.json();
		const { name, email, company, phone, message } = body;

		// Validate required fields
		if (!name || !email) {
			return NextResponse.json(
				{ error: "Name and email are required" },
				{ status: 400 }
			);
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return NextResponse.json(
				{ error: "Invalid email address" },
				{ status: 400 }
			);
		}

		// Create timestamp
		const timestamp = new Date().toLocaleString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZoneName: "short",
		});

		// Render the React Email component to HTML
		const emailHtml = await render(
			ScheduleDemoRequestEmail({
				name,
				email,
				company,
				phone,
				message,
				timestamp,
			})
		);

		// Send email via Resend
		const data = await resend.emails.send({
			from: "OneTool Demo Requests <support@onetool.biz>",
			to: ["support@onetool.biz"],
			subject: `New Demo Request from ${name}${company ? ` - ${company}` : ""}`,
			html: emailHtml,
			replyTo: email,
		});

		return NextResponse.json(
			{
				success: true,
				message: "Demo request sent successfully",
				data,
			},
			{ status: 200 }
		);
	} catch (error) {
		// PUB-15: never echo raw SDK errors to unauthenticated callers.
		console.error("Error sending demo request email:", error);
		return NextResponse.json(
			{ error: "Failed to send demo request. Please try again." },
			{ status: 500 }
		);
	}
}

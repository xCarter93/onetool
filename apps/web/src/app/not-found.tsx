// The landing entry, not the app one: Next preloads this boundary's stylesheets on every route, and / already loads it.
import "@/app/(marketing)/marketing.css";
import type { Metadata } from "next";
import NotFoundView from "@/components/shared/not-found-view";

export const metadata: Metadata = {
	title: "Page not found | OneTool",
};

// Handles both unmatched URLs and notFound() thrown inside matched routes.
export default function NotFound() {
	return <NotFoundView />;
}

import type { Metadata } from "next";
import NotFoundView from "@/components/shared/not-found-view";

export const metadata: Metadata = {
	title: "Page not found | OneTool",
};

// Catches notFound() thrown inside matched routes (e.g. unknown help article).
// Unmatched URLs render global-not-found.tsx instead.
export default function NotFound() {
	return <NotFoundView />;
}

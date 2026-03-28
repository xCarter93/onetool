"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingCTAProps {
	contactFormId: string;
}

export function FloatingCTA({ contactFormId }: FloatingCTAProps) {
	const [isFormVisible, setIsFormVisible] = useState(true);

	useEffect(() => {
		const target = document.getElementById(contactFormId);
		if (!target) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsFormVisible(entry.isIntersecting);
			},
			{ threshold: 0 }
		);

		observer.observe(target);
		return () => observer.disconnect();
	}, [contactFormId]);

	return (
		<div
			className={cn(
				"fixed bottom-6 left-4 right-4 z-40 lg:hidden transition-transform duration-300",
				isFormVisible ? "translate-y-[200%]" : "translate-y-0"
			)}
		>
			<button
				type="button"
				onClick={() =>
					document
						.getElementById(contactFormId)
						?.scrollIntoView({ behavior: "smooth", block: "start" })
				}
				className="w-full bg-primary text-primary-fg font-medium py-3 px-6 rounded-xl shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
			>
				<Send className="size-4" />
				Request a Quote
			</button>
		</div>
	);
}

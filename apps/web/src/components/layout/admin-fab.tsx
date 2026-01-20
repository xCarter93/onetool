"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminFab() {
	const pathname = usePathname();
	const [isHovered, setIsHovered] = useState(false);

	const isOnAdminPage = pathname?.startsWith("/admin");

	// Using StyledButton styling patterns
	const baseClasses =
		"group inline-flex items-center gap-2 font-semibold transition-all duration-200 rounded-lg ring-1 shadow-sm hover:shadow-md backdrop-blur-sm";
	const intentClasses =
		"text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40";

	return (
		<Link
			href={isOnAdminPage ? "/home" : "/admin"}
			className={cn(
				"fixed bottom-6 right-6 z-50",
				baseClasses,
				intentClasses,
				"focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
				isOnAdminPage ? "px-4 py-2.5" : "p-2.5",
				isHovered && !isOnAdminPage && "pr-4"
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{isOnAdminPage ? (
				<>
					<X className="h-5 w-5" />
					<span className="text-sm">Close Admin</span>
				</>
			) : (
				<>
					<Shield className="h-5 w-5" />
					<span
						className={cn(
							"text-sm overflow-hidden transition-all duration-200",
							isHovered ? "w-auto opacity-100" : "w-0 opacity-0"
						)}
					>
						Admin
					</span>
				</>
			)}
		</Link>
	);
}

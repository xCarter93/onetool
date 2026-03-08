"use client";

import { ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

interface AccentCTALinkProps {
	href: string;
	size?: "sm" | "default";
	children: React.ReactNode;
	className?: string;
}

interface AccentCTAButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	href?: never;
	size?: "sm" | "default";
	children: React.ReactNode;
}

type AccentCTAProps = AccentCTALinkProps | AccentCTAButtonProps;

const AccentCTA = forwardRef<HTMLButtonElement, AccentCTAProps>(
	({ size = "default", children, className = "", ...rest }, ref) => {
		const href = "href" in rest ? rest.href : undefined;
		const { href: _href, ...props } = rest as AccentCTAButtonProps & { href?: string };
		const sm = size === "sm";
		const inner = (
			<>
				{/* Accent background strip behind arrow */}
				<span
					className={`absolute right-0 inset-y-0 ${sm ? "w-[calc(100%-1.5rem)]" : "w-[calc(100%-2rem)]"} rounded-lg bg-primary/10`}
				/>
				{/* Main button - matches StyledButton primary intent */}
				<span
					className={`relative z-10 ${sm ? "text-xs px-3 py-1.5" : "text-sm px-4 py-2"} rounded-lg font-semibold ring-1 shadow-sm backdrop-blur-sm text-primary bg-primary/10 ring-primary/30`}
				>
					{children}
				</span>
				{/* Arrow - theme-aware foreground color */}
				<span
					className={`relative -left-px z-10 ${sm ? "w-8 h-8" : "w-10 h-10"} rounded-lg flex items-center justify-center text-foreground/70`}
				>
					<ArrowDownRight
						className={`${sm ? "w-3.5 h-3.5" : "w-4 h-4"} transition-transform duration-300 group-hover:-rotate-45`}
					/>
				</span>
			</>
		);

		const cls = `group relative cursor-pointer inline-flex items-center transition-transform hover:scale-[1.02] active:scale-[0.98] ${className}`;

		if (href) {
			return (
				<Link href={href} className={cls}>
					{inner}
				</Link>
			);
		}

		return (
			<button ref={ref} className={cls} {...props}>
				{inner}
			</button>
		);
	}
);

AccentCTA.displayName = "AccentCTA";

export { AccentCTA };

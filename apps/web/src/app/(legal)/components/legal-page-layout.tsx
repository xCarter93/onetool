"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

interface LegalPageLayoutProps {
	title: string;
	lastUpdated: string;
	children: React.ReactNode;
}

const legalPages = [
	{ href: "/terms-of-service", label: "Terms of Service" },
	{ href: "/privacy-policy", label: "Privacy Policy" },
	{ href: "/data-security", label: "Data Security" },
] as const;

export function LegalPageLayout({
	title,
	lastUpdated,
	children,
}: LegalPageLayoutProps) {
	const pathname = usePathname();

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<header className="sticky top-0 z-50 w-full border-b border-border bg-background">
				<div className="mx-auto max-w-6xl px-6 lg:px-8">
					<div className="flex h-16 items-center justify-between">
						{/* Logo */}
						<Link
							href="/"
							className="flex items-center gap-2 transition-opacity hover:opacity-80"
						>
							<Image
								src="/OneTool.png"
								alt="OneTool"
								width={150}
								height={150}
								className="dark:brightness-0 dark:invert"
							/>
						</Link>

						{/* Desktop Navigation */}
						<nav className="hidden sm:flex items-center gap-1">
							{legalPages.map((page) => {
								const isActive = pathname === page.href;
								return (
									<Link
										key={page.href}
										href={page.href}
										className={`
											px-3 py-2 text-sm font-medium rounded-md transition-colors
											${
												isActive
													? "text-foreground bg-muted"
													: "text-muted-foreground hover:text-foreground hover:bg-muted/50"
											}
										`}
									>
										{page.label}
									</Link>
								);
							})}
						</nav>

						{/* Mobile Navigation - Dropdown style links */}
						<nav className="flex sm:hidden items-center gap-1">
							{legalPages.map((page) => {
								const isActive = pathname === page.href;
								return (
									<Link
										key={page.href}
										href={page.href}
										className={`
											px-2 py-1.5 text-xs font-medium rounded transition-colors
											${
												isActive
													? "text-foreground bg-muted"
													: "text-muted-foreground hover:text-foreground"
											}
										`}
									>
										{page.label.split(" ")[0]}
									</Link>
								);
							})}
						</nav>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="mx-auto max-w-6xl px-6 py-12 sm:py-16 lg:px-8">
				{/* Page Header */}
				<div className="mb-10 sm:mb-12">
					<h1 className="text-[32px] font-semibold leading-tight tracking-tight text-foreground">
						{title}
					</h1>
					<p className="mt-3 text-sm text-muted-foreground">
						Last Updated: {lastUpdated}
					</p>
				</div>

				{/* Content */}
				<div className="prose prose-gray dark:prose-invert max-w-3xl text-base leading-7">
					{children}
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-border bg-background">
				<div className="mx-auto max-w-6xl px-6 py-4 lg:px-8">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4">
						<div className="flex items-center gap-2">
							<Image
								src="/OneTool.png"
								alt="OneTool"
								width={120}
								height={120}
								className="dark:brightness-0 dark:invert"
							/>
							<span className="text-sm text-muted-foreground">
								{new Date().getFullYear()} OneTool. All rights reserved.
							</span>
						</div>
						<nav className="flex items-center gap-4 text-sm">
							{legalPages.map((page) => (
								<Link
									key={page.href}
									href={page.href}
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									{page.label}
								</Link>
							))}
						</nav>
					</div>
				</div>
			</footer>
		</div>
	);
}

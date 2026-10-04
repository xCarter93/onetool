"use client";

import { ClerkLoaded, ClerkLoading, SignIn, SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { formatCurrency } from "@/lib/money";
import "./auth-shell.css";

const sharedElements = {
	rootBox: "w-full flex justify-center",
	logoBox: "hidden",
	formButtonPrimary:
		"auth-primary min-h-12 rounded bg-primary text-primary-foreground text-base hover:bg-primary/90 shadow-none",
	cardBox: "w-full max-w-none shadow-none rounded-none bg-transparent",
	card: "w-full shadow-none rounded-none border-none bg-transparent p-4",
	footer: { background: "transparent" },
	footerAction: "bg-transparent border-none shadow-none",
	header: "items-center gap-3 text-center",
	headerTitle: "text-foreground text-3xl font-semibold tracking-tight",
	headerSubtitle: "text-muted-foreground text-base leading-relaxed",
	socialButtonsBlockButton:
		"auth-social min-h-12 rounded border border-input bg-background shadow-none",
	socialButtonsBlockButtonText: "text-base font-medium",
	formFieldLabel: "text-foreground",
	formFieldInput:
		"auth-input min-h-12 rounded border border-input bg-background text-base focus:border-primary focus:ring-primary",
	formFieldInputShowPasswordButton: "min-h-12 min-w-12",
	footerActionLink: "auth-clerk-link text-primary hover:text-primary/90",
	formFieldAction: "auth-clerk-link",
	formResendCodeLink: "auth-clerk-link",
	backLink: "auth-clerk-link",
};

interface SignInUpFormProps {
	mode: "sign-in" | "sign-up";
}

export function SignInUpForm({ mode }: SignInUpFormProps) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	const clerkAppearance = {
		theme: isDark ? dark : undefined,
		variables: { fontSize: "1rem", fontFamily: "inherit" },
		elements: sharedElements,
	};

	return (
		<div className="auth-shell relative isolate min-h-svh w-full bg-background lg:grid lg:grid-cols-[48%_52%]">
			<a href="#auth-content" className="auth-skip-link">
				Skip to sign in or sign up
			</a>
			<div className="flex min-h-svh min-w-0 flex-col">
				<header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-12 lg:px-12 xl:px-16">
					{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load: the landing ships its own Tailwind sheet */}
					<a
						href="/"
						className="flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					>
						<Image
							src="/OneTool-wordmark.png"
							alt="OneTool home"
							width={908}
							height={237}
							sizes="132px"
							className="h-auto w-[132px] dark:brightness-0 dark:invert"
							priority
						/>
					</a>
					<div className="flex items-center gap-2">
						<ThemeSwitcher className="auth-theme-switcher" />
						{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load: the landing ships its own Tailwind sheet */}
						<a
							href="/"
							className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
						>
							Back to home
						</a>
					</div>
				</header>
				<main
					id="auth-content"
					className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 sm:px-10 lg:px-12 xl:px-16"
					tabIndex={-1}
				>
					<div className="w-full max-w-lg">
						<p className="mb-6 px-4 text-sm leading-relaxed text-muted-foreground lg:hidden">
							Clients, jobs and payments in one place.
						</p>
						<ClerkLoading>
							<div className="auth-loading" role="status" aria-live="polite">
								<h1>
									{mode === "sign-in"
										? "Sign in to OneTool"
										: "Create your OneTool account"}
								</h1>
								<p>Preparing your secure form...</p>
								<div className="auth-loading-outline" aria-hidden="true">
									<div className="auth-loading-social" />
									<div className="auth-loading-label" />
									<div className="auth-loading-input" />
									<div className="auth-loading-button" />
								</div>
							</div>
						</ClerkLoading>
						<ClerkLoaded>
							{mode === "sign-in" ? (
								<SignIn
									appearance={clerkAppearance}
									routing="path"
									path="/sign-in"
									signUpUrl="/sign-up"
									fallbackRedirectUrl="/home"
								/>
							) : (
								<SignUp
									appearance={clerkAppearance}
									routing="path"
									path="/sign-up"
									signInUrl="/sign-in"
									fallbackRedirectUrl="/home"
								/>
							)}
						</ClerkLoaded>
						<p className="text-muted-foreground mt-6 px-4 text-center text-xs leading-relaxed">
							By continuing, you agree to our{" "}
							<Link
								href="/terms-of-service"
								className="auth-legal-link hover:text-foreground underline underline-offset-2"
							>
								Terms of Service
							</Link>{" "}
							and{" "}
							<Link
								href="/privacy-policy"
								className="auth-legal-link hover:text-foreground underline underline-offset-2"
							>
								Privacy Policy
							</Link>
							.
						</p>
					</div>
				</main>
			</div>

			<aside
				className="auth-story relative hidden min-w-0 flex-col justify-end overflow-hidden lg:flex"
				aria-label="Example OneTool job"
			>
				<div className="auth-story-image absolute inset-x-0 top-0 h-[68%]">
					<Image
						src="/landing/field/driveway.webp"
						alt="Work van parked outside a house at dusk, with OneTool on the dashboard phone"
						fill
						sizes="52vw"
						className="object-cover object-left"
						priority
					/>
				</div>
				<div className="auth-story-content relative px-12 pb-14 xl:px-16 xl:pb-20">
					<p className="mb-4 text-sm text-(--toast-fg-muted)">
						OneTool, from first quote to final payment
					</p>
					<h2 className="max-w-md text-3xl font-semibold tracking-tight xl:text-4xl">
						Quote it. Get it signed. Get paid.
					</h2>
					<div className="auth-story-sequence mt-8 max-w-lg">
						<p className="py-4 text-sm text-(--toast-fg-muted)">
							Example job · Whitfield Property Group
						</p>
						<div className="auth-story-row">
							<span>Quote</span>
							<span className="auth-story-status">Signed</span>
						</div>
						<div className="auth-story-row">
							<span>Visit</span>
							<span className="auth-story-status">Completed</span>
						</div>
						<div className="auth-story-row">
							<span>Invoice</span>
							<span className="flex items-center gap-4">
								<span className="tabular-nums">{formatCurrency(1082.5)}</span>
								<span className="auth-story-status">Paid</span>
							</span>
						</div>
					</div>
				</div>
			</aside>
		</div>
	);
}

export default SignInUpForm;

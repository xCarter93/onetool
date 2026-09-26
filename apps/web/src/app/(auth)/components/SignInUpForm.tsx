"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";

const getSharedElements = (isDark: boolean) => ({
	rootBox: "w-full flex justify-center",
	logoBox: "justify-center",
	logoImage: {
		width: "160px",
		height: "auto",
		...(isDark && { filter: "brightness(0) invert(1)" }),
	},
	formButtonPrimary:
		"min-h-12 rounded bg-primary text-primary-foreground text-base hover:bg-primary/90 shadow-none",
	cardBox: "w-full max-w-none shadow-none rounded-none bg-transparent",
	card: "w-full shadow-none rounded-none border-none bg-transparent p-4",
	footer: { background: "transparent" },
	footerAction: "bg-transparent border-none shadow-none",
	header: "items-center gap-3 text-center",
	headerTitle: "text-foreground text-3xl font-semibold tracking-tight",
	headerSubtitle: "text-muted-foreground text-base leading-relaxed",
	socialButtonsBlockButton:
		"min-h-12 rounded border border-input bg-background shadow-none",
	socialButtonsBlockButtonText: "text-base font-medium",
	formFieldLabel: "text-foreground",
	formFieldInput:
		"min-h-12 rounded border border-input bg-background focus:border-primary focus:ring-primary",
	formFieldInputShowPasswordButton: "min-h-12 min-w-12",
	footerActionLink: "text-primary hover:text-primary/90",
});

interface SignInUpFormProps {
	mode: "sign-in" | "sign-up";
}

export function SignInUpForm({ mode }: SignInUpFormProps) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	const clerkAppearance = {
		theme: isDark ? dark : undefined,
		variables: { fontSize: "1rem" },
		elements: getSharedElements(isDark),
	};

	return (
		<div className="bg-background relative isolate min-h-svh w-full overflow-x-clip lg:grid lg:grid-cols-2">
			<section className="relative z-10 flex min-h-svh min-w-0 items-center justify-center px-6 py-12 sm:px-12 xl:px-16">
				<div className="w-full max-w-lg">
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
					{/* Mobile cannot render Clerk's consent checkbox, so web carries the notice. */}
					<p className="text-muted-foreground mt-6 px-4 text-center text-xs leading-relaxed">
						By continuing, you agree to our{" "}
						<Link
							href="/terms-of-service"
							className="hover:text-foreground underline underline-offset-2"
						>
							Terms of Service
						</Link>{" "}
						and{" "}
						<Link
							href="/privacy-policy"
							className="hover:text-foreground underline underline-offset-2"
						>
							Privacy Policy
						</Link>
						.
					</p>
				</div>
			</section>

			<aside className="pointer-events-none relative hidden min-w-0 flex-col justify-center py-12 lg:flex">
				<div className="px-12 xl:px-16">
					<h2 className="text-foreground text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
						Your workday, organized.
					</h2>
					<p className="text-muted-foreground mt-4 max-w-xs text-base leading-relaxed">
						Clients, quotes, and jobs. All in OneTool.
					</p>
				</div>
				<div className="relative mt-8 -ml-20 w-[calc(100%+5rem)] xl:-ml-32 xl:w-[calc(100%+8rem)]">
					<Image
						src="/auth/onetool-workday-cutout.png"
						alt=""
						width={2048}
						height={1360}
						sizes="(min-width: 1280px) calc(50vw + 128px), (min-width: 1024px) calc(50vw + 80px), 1px"
						className="h-auto w-full"
						priority
					/>
				</div>
			</aside>
		</div>
	);
}

export default SignInUpForm;

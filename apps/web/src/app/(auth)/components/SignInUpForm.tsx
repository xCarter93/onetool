"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import Image from "next/image";
import { AuthGridBackground } from "@/components/blocks/auth-6/components/auth-grid-background";

const BASE_TRANSITION: Transition = { ease: "anticipate", duration: 0.5 };

const getSharedElements = (isDark: boolean) => ({
	rootBox: "w-full flex justify-center",
	logoImage: {
		width: "200px",
		height: "auto",
		...(isDark && { filter: "brightness(0) invert(1)" }),
	},
	formButtonPrimary:
		"bg-primary/10 hover:bg-primary/15 text-primary hover:text-primary/80 ring-1 ring-primary/30 hover:ring-primary/40 shadow-sm hover:shadow-md backdrop-blur-sm transition-all duration-200",
	// Flat, card-free form: the page is the surface.
	// overflow stays hidden on cardBox — it clips Clerk's card chrome (border/
	// shadow painted on an inner element); px-3 keeps inputs clear of that clip.
	cardBox: "w-full max-w-none shadow-none rounded-none bg-transparent",
	card: "w-full shadow-none rounded-none border-none bg-transparent px-3",
	footer: { background: "transparent" },
	footerAction: "bg-transparent border-none shadow-none",
	headerTitle: "text-foreground",
	headerSubtitle: "text-muted-foreground",
	socialButtonsBlockButton:
		"border-border hover:bg-accent hover:text-accent-foreground",
	formFieldLabel: "text-foreground",
	formFieldInput:
		"bg-background border-border focus:border-primary focus:ring-primary",
	footerActionLink: "text-primary hover:text-primary/90",
});

interface SignInUpFormProps {
	mode: "sign-in" | "sign-up";
}

export function SignInUpForm({ mode }: SignInUpFormProps) {
	const { resolvedTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	const clerkAppearance = {
		baseTheme: isDark ? dark : undefined,
		elements: getSharedElements(isDark),
	};

	return (
		<div className="bg-background w-full lg:grid lg:min-h-svh lg:grid-cols-[3fr_2fr]">
			{/* Form */}
			<section className="flex min-h-svh min-w-0 items-center justify-center px-6 py-10 sm:px-8 lg:px-12">
				<div className="w-full max-w-lg">
					<AnimatePresence mode="wait">
						<motion.div
							key={mode}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							transition={BASE_TRANSITION}
						>
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
						</motion.div>
					</AnimatePresence>
				</div>
			</section>

			{/* Sidebar — primary-blue animated grid + framed photo, no logos or copy */}
			<aside className="bg-primary/[0.03] border-border/70 relative hidden overflow-hidden px-8 py-12 lg:flex lg:min-h-svh lg:border-l">
				<AuthGridBackground />

				<div className="relative z-10 flex min-h-full w-full items-center justify-center">
					<div className="mx-auto flex w-full max-w-160 flex-col items-start">
						<div className="bg-background/90 border-border/60 relative w-full overflow-hidden rounded-xl border backdrop-blur-sm">
							<Image
								src="https://images.unsplash.com/photo-1690378820474-b468b8ee64d3?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
								alt=""
								width={1470}
								height={980}
								sizes="(min-width: 1024px) 50vw, 100vw"
								className="h-auto w-full object-cover"
								priority
							/>
						</div>
					</div>
				</div>
			</aside>
		</div>
	);
}

export default SignInUpForm;

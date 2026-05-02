import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import Image from "next/image";
import { SecuredByOneTool } from "@/components/portal/powered-by-onetool";
import { CheckCircle2 } from "lucide-react";

export default async function SignedOutPage({
	params,
}: {
	params: Promise<{ clientPortalId: string }>;
}) {
	const { clientPortalId } = await params;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	const businessName = branding?.name ?? "your provider";
	const monogram = businessName.charAt(0).toUpperCase();

	return (
		<div className="flex min-h-screen flex-col bg-card">
			<header className="flex items-center justify-between px-6 py-5 md:px-12">
				<div className="flex items-center gap-2">
					<Image
						src="/OneTool.png"
						alt=""
						width={32}
						height={32}
						className="dark:brightness-0 dark:invert"
						aria-hidden="true"
					/>
					<span className="text-sm font-semibold">OneTool</span>
				</div>
			</header>

			<main className="flex flex-1 items-center justify-center px-6 py-10">
				<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
					<div className="relative">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
							{branding?.logoUrl ? (
								<Image
									src={branding.logoUrl}
									alt={`${businessName} logo`}
									width={40}
									height={40}
									className="rounded-md"
									unoptimized
								/>
							) : (
								<span className="text-2xl font-bold text-primary">
									{monogram}
								</span>
							)}
						</div>
						<span
							aria-hidden="true"
							className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-4 ring-card"
						>
							<CheckCircle2 className="h-4 w-4" />
						</span>
					</div>

					<div className="flex flex-col gap-2">
						<h1 className="text-[26px] font-semibold tracking-[-0.02em]">
							You&apos;re signed out
						</h1>
						<p className="text-sm text-muted-foreground">
							You&apos;ve safely signed out of {businessName}&apos;s portal. To
							return, use the link in your email.
						</p>
					</div>

					<SecuredByOneTool className="mt-6" />
				</div>
			</main>
		</div>
	);
}

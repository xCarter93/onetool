import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Receipt, FileSignature, CalendarCheck } from "lucide-react";
import OtpForm from "@/components/portal/otp-form";
import { PoweredByOneTool } from "@/components/portal/powered-by-onetool";

export default async function VerifyPage({
	params,
	searchParams,
}: {
	params: Promise<{ clientPortalId: string }>;
	searchParams: Promise<{ next?: string }>;
}) {
	const { clientPortalId } = await params;
	const { next } = await searchParams;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound();
		return null;
	}

	const monogram = branding.name.charAt(0).toUpperCase();

	return (
		<div className="grid min-h-screen md:grid-cols-[1.05fr_minmax(0,480px)]">
			{/* LEFT — co-branded hero (desktop only) */}
			<aside className="relative hidden md:flex flex-col justify-between overflow-hidden bg-linear-to-br from-primary via-primary/85 to-primary/60 px-12 py-10 text-primary-foreground">
				{/* dot grid decoration */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 opacity-[0.07]"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
						backgroundSize: "22px 22px",
					}}
				/>

				{/* OneTool wordmark — top */}
				<div className="relative flex items-center gap-2 text-sm font-semibold">
					<Image
						src="/OneTool.png"
						alt=""
						width={20}
						height={20}
						className="brightness-0 invert"
						aria-hidden="true"
					/>
					<span>OneTool</span>
					<span className="ml-2 border-l border-primary-foreground/25 pl-3 text-[11px] font-normal text-primary-foreground/70">
						Customer portal
					</span>
				</div>

				{/* Customer hero */}
				<div className="relative flex flex-col">
					<div className="mb-6 flex items-center gap-3">
						{branding.logoUrl ? (
							<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-lg shadow-primary/30">
								<Image
									src={branding.logoUrl}
									alt={`${branding.name} logo`}
									width={44}
									height={44}
									className="rounded-lg object-contain"
									unoptimized
								/>
							</div>
						) : (
							<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-2xl font-bold text-primary shadow-lg shadow-primary/30">
								{monogram}
							</div>
						)}
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">
								Welcome to
							</div>
							<div className="mt-0.5 text-xl font-semibold tracking-tight">
								{branding.name}
							</div>
						</div>
					</div>

					<h1 className="max-w-[460px] text-[34px] font-semibold leading-[1.1] tracking-[-0.025em]">
						Your service portal,
						<br />
						simplified.
					</h1>
					<p className="mt-3 max-w-[400px] text-sm leading-relaxed text-primary-foreground/80">
						Quotes, invoices, and online payments — everything from{" "}
						{branding.name} in one secure place.
					</p>

					<ul className="mt-7 flex flex-col gap-3">
						{[
							{ Icon: Receipt, text: "Pay invoices in one tap" },
							{ Icon: FileSignature, text: "Review and sign quotes online" },
							{ Icon: CalendarCheck, text: "Track upcoming visits" },
						].map(({ Icon, text }) => (
							<li
								key={text}
								className="flex items-center gap-3 text-[13.5px] text-primary-foreground/90"
							>
								<span className="flex h-7 w-7 items-center justify-center rounded-md border border-primary-foreground/15 bg-primary-foreground/10">
									<Icon className="h-3.5 w-3.5" aria-hidden="true" />
								</span>
								{text}
							</li>
						))}
					</ul>
				</div>

				<p className="relative text-[11px] text-primary-foreground/55">
					{branding.name} uses OneTool to power their customer portal.
				</p>
			</aside>

			{/* RIGHT — clean form */}
			<main className="flex flex-col bg-card px-6 py-10 md:px-14 md:py-12">
				{/* Mobile co-brand header */}
				<div className="mb-8 flex items-center gap-3 md:hidden">
					{branding.logoUrl ? (
						<Image
							src={branding.logoUrl}
							alt={`${branding.name} logo`}
							width={36}
							height={36}
							className="rounded-md"
							unoptimized
						/>
					) : (
						<div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-base font-bold text-primary">
							{monogram}
						</div>
					)}
					<div>
						<div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Welcome to
						</div>
						<div className="text-base font-semibold leading-tight">
							{branding.name}
						</div>
					</div>
				</div>

				<div className="my-auto flex flex-col gap-2">
					<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
						Sign in
					</p>
					<OtpForm
						businessName={branding.name}
						clientPortalId={clientPortalId}
						nextPath={next}
					/>
				</div>

				<div className="mt-12 md:mt-auto md:pt-12">
					<PoweredByOneTool />
				</div>
			</main>
		</div>
	);
}

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
			<aside
				className="relative hidden md:flex flex-col justify-between overflow-hidden px-12 py-10 text-white"
				style={{
					background: `
						radial-gradient(ellipse 70% 55% at 12% -5%, oklch(0.62 0.20 232 / 0.55), transparent 60%),
						radial-gradient(ellipse 60% 50% at 95% 105%, oklch(0.58 0.14 215 / 0.4), transparent 60%),
						linear-gradient(135deg, oklch(0.21 0.05 250) 0%, oklch(0.17 0.04 248) 55%, oklch(0.19 0.06 245) 100%)
					`,
				}}
			>
				{/* dot grid texture */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 opacity-[0.07]"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
						backgroundSize: "22px 22px",
					}}
				/>

				{/* OneTool masthead — prominent, sets the platform context */}
				<div className="relative flex items-center gap-4">
					<Image
						src="/OneTool.png"
						alt="OneTool"
						width={160}
						height={160}
						className="brightness-0 invert"
					/>
					<span className="border-l border-white/20 pl-4 text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
						Customer portal
					</span>
				</div>

				{/* Customer hero — the visual focal point */}
				<div className="relative flex flex-col">
					<div className="mb-7 flex items-center gap-4">
						{branding.logoUrl ? (
							<div
								className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-white p-2"
								style={{
									boxShadow:
										"0 12px 40px -8px oklch(0.62 0.20 232 / 0.55), 0 0 0 1px oklch(1 0 0 / 0.08)",
								}}
							>
								{/* [Review fix WR-10] Image optimizer enforces size/content-type. */}
								<Image
									src={branding.logoUrl}
									alt={`${branding.name} logo`}
									width={52}
									height={52}
									className="rounded-lg object-contain"
								/>
							</div>
						) : (
							<div
								className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-white text-[30px] font-bold tracking-[-0.03em] text-primary"
								style={{
									boxShadow:
										"0 12px 40px -8px oklch(0.62 0.20 232 / 0.55), 0 0 0 1px oklch(1 0 0 / 0.08)",
								}}
							>
								{monogram}
							</div>
						)}
						<div>
							<div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/55">
								Welcome to
							</div>
							<div className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.015em]">
								{branding.name}
							</div>
						</div>
					</div>

					<h1 className="max-w-[480px] text-[40px] font-semibold leading-[1.05] tracking-[-0.025em]">
						Your service portal,
						<br />
						<span className="text-white/70">simplified.</span>
					</h1>
					<p className="mt-5 max-w-[420px] text-[15px] leading-relaxed text-white/70">
						Quotes, invoices, and online payments — everything from{" "}
						<span className="font-medium text-white/90">{branding.name}</span>{" "}
						in one secure place.
					</p>

					<ul className="mt-9 flex flex-col gap-3.5">
						{[
							{ Icon: Receipt, text: "Pay invoices in one tap" },
							{ Icon: FileSignature, text: "Review and sign quotes online" },
							{ Icon: CalendarCheck, text: "Track upcoming visits" },
						].map(({ Icon, text }) => (
							<li
								key={text}
								className="flex items-center gap-3.5 text-[14px] text-white/85"
							>
								<span
									className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/6 backdrop-blur-sm"
									style={{
										boxShadow:
											"inset 0 1px 0 0 oklch(1 0 0 / 0.06)",
									}}
								>
									<Icon
										className="h-[18px] w-[18px] text-[oklch(0.78_0.14_232)]"
										aria-hidden="true"
									/>
								</span>
								{text}
							</li>
						))}
					</ul>
				</div>

				<p className="relative text-[12px] text-white/45">
					{branding.name} uses OneTool to power their customer portal.
				</p>
			</aside>

			{/* RIGHT — clean form */}
			<main className="flex flex-col bg-card px-6 py-10 md:px-14 md:py-12">
				{/* Mobile co-brand header */}
				<div className="mb-8 flex items-center gap-3 md:hidden">
					{branding.logoUrl ? (
						{/* [Review fix WR-10] Image optimizer enforces size/content-type. */}
						<Image
							src={branding.logoUrl}
							alt={`${branding.name} logo`}
							width={44}
							height={44}
							className="rounded-lg"
						/>
					) : (
						<div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
							{monogram}
						</div>
					)}
					<div>
						<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
							Welcome to
						</div>
						<div className="text-base font-semibold leading-tight">
							{branding.name}
						</div>
					</div>
				</div>

				<div className="my-auto flex flex-col gap-2">
					<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
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

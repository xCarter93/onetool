import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { notFound } from "next/navigation";
import { FileText, ReceiptText, Mail } from "lucide-react";

export default async function AuthenticatedPortalHome({
	params,
}: {
	params: Promise<{ clientPortalId: string }>;
}) {
	const { clientPortalId } = await params;
	const branding = await fetchQuery(api.portal.branding.getPortalBranding, {
		clientPortalId,
	});
	if (!branding) {
		notFound();
		return null;
	}

	return (
		<div className="max-w-3xl">
			<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
				Welcome
			</p>
			<h1 className="mt-3 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em]">
				Your portal with {branding.name}
			</h1>
			<p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
				Quotes and invoices from {branding.name} land here automatically. No
				apps to install, nothing to set up — just open the link from your email
				whenever you need to.
			</p>

			<div className="mt-12 grid gap-y-10 md:grid-cols-2 md:gap-x-12">
				<section className="border-l-2 border-primary pl-5">
					<div className="flex items-center gap-2.5">
						<FileText
							className="h-[18px] w-[18px] text-primary"
							aria-hidden="true"
						/>
						<h2 className="text-[15px] font-semibold tracking-tight">
							Quotes
						</h2>
					</div>
					<p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
						Review the work, costs, and timeline. Reply with questions or
						approve in a single tap — no PDFs to print.
					</p>
					<p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary/80">
						Coming with the next release
					</p>
				</section>

				<section className="border-l-2 border-primary/35 pl-5">
					<div className="flex items-center gap-2.5">
						<ReceiptText
							className="h-[18px] w-[18px] text-primary"
							aria-hidden="true"
						/>
						<h2 className="text-[15px] font-semibold tracking-tight">
							Invoices
						</h2>
					</div>
					<p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
						See what's due, download a copy for your records, and pay online —
						no calls, no checks in the mail.
					</p>
					<p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary/60">
						Coming after quotes
					</p>
				</section>
			</div>

			<div className="mt-14 flex items-start gap-3 rounded-xl bg-muted/50 px-5 py-4">
				<Mail
					className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<div className="text-sm">
					<p className="font-medium text-foreground">Need something now?</p>
					<p className="mt-0.5 leading-relaxed text-muted-foreground">
						Reach out to {branding.name} directly. The portal is in addition to
						— not a replacement for — talking to your provider.
					</p>
				</div>
			</div>
		</div>
	);
}

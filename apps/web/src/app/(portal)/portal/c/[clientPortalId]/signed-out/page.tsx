import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
// Signed-out page uses SecuredByOneTool variant per UI-SPEC.
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

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<div className="max-w-md w-full text-center flex flex-col items-center gap-6">
				<div className="rounded-full bg-muted p-4">
					<CheckCircle2
						className="h-10 w-10 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
				<h1 className="text-2xl font-semibold">You&apos;ve been signed out</h1>
				<p className="text-sm text-muted-foreground">
					You&apos;ve been signed out of {businessName}&apos;s portal. To
					return, use the link in your email.
				</p>
				<SecuredByOneTool className="mt-8" />
			</div>
		</div>
	);
}

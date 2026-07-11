import type { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import ConvexClientProvider from "@/providers/ConvexClientProvider";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { ConfirmDialogProvider } from "@/hooks/use-confirm-dialog";
import { AnalyticsIdentity } from "@/components/analytics-identity";

// Full-screen onboarding shell: same providers as the workspace, minus the
// sidebar/header chrome. /organization/complete lives here so net-new users
// get an immersive setup flow.
export default function OnboardingLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<ClerkProviderWithTheme>
			<PostHogProvider>
				<ConvexClientProvider>
					<ConfirmDialogProvider>
						<AnalyticsIdentity />
						{children}
					</ConfirmDialogProvider>
				</ConvexClientProvider>
			</PostHogProvider>
		</ClerkProviderWithTheme>
	);
}

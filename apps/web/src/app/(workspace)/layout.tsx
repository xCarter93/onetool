import type { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import ConvexClientProvider from "@/providers/ConvexClientProvider";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { DynamicTitle } from "@/components/shared/dynamic-title";
import { ConfirmDialogProvider } from "@/hooks/use-confirm-dialog";
import { SidebarWithHeader } from "@/components/layout/sidebar-with-header";
import { AnalyticsIdentity } from "@/components/analytics-identity";
import { ScreenContextProvider } from "@/components/assistant/use-screen-context";
import { CreateRecordProvider } from "@/components/domain/create-record-provider";
import "./workspace-theme.css";

// Every workspace route is auth-gated and user-specific; none may be
// prerendered. This used to be implied by a currentUser() call in this layout —
// declare it directly now that the call is gone.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<ClerkProviderWithTheme>
			<PostHogProvider>
				<ConvexClientProvider>
					<DynamicTitle />
					<ConfirmDialogProvider>
						<div className="workspace-zone min-h-screen flex-1 md:min-h-min">
							<AnalyticsIdentity />
							{/* No ambient blobs / grid overlays here: absolutely-positioned
							    decorations paint over the static picture-frame background
							    (but under the card and notches), tinting the frame unevenly. */}
							<div className="relative bg-background min-h-screen">
								<ScreenContextProvider>
									<CreateRecordProvider>
										<SidebarWithHeader>{children}</SidebarWithHeader>
									</CreateRecordProvider>
								</ScreenContextProvider>
							</div>
						</div>
					</ConfirmDialogProvider>
				</ConvexClientProvider>
			</PostHogProvider>
		</ClerkProviderWithTheme>
	);
}

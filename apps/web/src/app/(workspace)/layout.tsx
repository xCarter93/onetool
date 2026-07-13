import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";
import ConvexClientProvider from "@/providers/ConvexClientProvider";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { DynamicTitle } from "@/components/shared/dynamic-title";
import { ConfirmDialogProvider } from "@/hooks/use-confirm-dialog";
import { SidebarWithHeader } from "@/components/layout/sidebar-with-header";
import { AnalyticsIdentity } from "@/components/analytics-identity";
import { AdminFab } from "@/components/layout/admin-fab";
import { ScreenContextProvider } from "@/components/assistant/use-screen-context";
import { CreateRecordProvider } from "@/components/domain/create-record-provider";
import "./workspace-theme.css";

export default async function WorkspaceLayout({
	children,
}: {
	children: ReactNode;
}) {
	// currentUser() works because clerkMiddleware ran upstream (workspace routes are NOT in isPortalRoute)
	const user = await currentUser();
	const hasAdminAccess =
		(user?.privateMetadata as Record<string, unknown>)
			?.has_admin_dashboard_access === true;

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
								{hasAdminAccess && <AdminFab />}
							</div>
						</div>
					</ConfirmDialogProvider>
				</ConvexClientProvider>
			</PostHogProvider>
		</ClerkProviderWithTheme>
	);
}

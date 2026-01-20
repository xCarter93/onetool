import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	const user = await currentUser();
	const hasAdminAccess =
		(user?.privateMetadata as Record<string, unknown>)
			?.has_admin_dashboard_access === true;

	if (!hasAdminAccess) {
		redirect("/home");
	}

	return <>{children}</>;
}

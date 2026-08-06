import type { Metadata } from "next";
import { PermissionGate } from "@/components/domain/permission-gate";
import { InboxScreen } from "./components/inbox-screen";

export const metadata: Metadata = {
	title: "Inbox",
};

export default async function InboxPage({
	searchParams,
}: {
	searchParams: Promise<{ thread?: string }>;
}) {
	const { thread } = await searchParams;
	return (
		<PermissionGate object="inbox">
			<InboxScreen initialThreadId={thread ?? null} />
		</PermissionGate>
	);
}

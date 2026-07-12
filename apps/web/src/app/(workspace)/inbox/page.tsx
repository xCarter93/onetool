import type { Metadata } from "next";
import { PermissionGate } from "@/components/domain/permission-gate";
import { InboxScreen } from "./components/inbox-screen";

export const metadata: Metadata = {
	title: "Inbox",
};

export default function InboxPage() {
	return (
		<PermissionGate object="inbox">
			<InboxScreen />
		</PermissionGate>
	);
}

import { PermissionGate } from "@/components/domain/permission-gate";
import CommunityEditContent from "./community-edit-content";

export default function CommunityEditPage() {
	return (
		<PermissionGate object="community">
			<CommunityEditContent />
		</PermissionGate>
	);
}

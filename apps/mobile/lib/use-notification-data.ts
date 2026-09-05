import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";

// One arg shape so Convex dedupes every caller to a single subscription; 50
// covers the sheets, the bells only read unreadCount.
const NOTIFICATION_LIMIT = 50;

export function useNotificationData(skip = false) {
	return useQuery(
		api.notifications.listForCurrentUser,
		skip ? "skip" : { limit: NOTIFICATION_LIMIT },
	);
}

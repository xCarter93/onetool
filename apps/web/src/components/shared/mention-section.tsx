"use client";

import { useState } from "react";
import { MentionInput } from "./mention-input";
import { MentionFeed } from "./mention-feed";
import {
	StyledCard,
	StyledCardHeader,
	StyledCardTitle,
	StyledCardContent,
} from "@/components/ui/styled";
import { MessageSquare } from "lucide-react";

interface MentionSectionProps {
	entityType: "client" | "project" | "quote";
	entityId: string;
	entityName: string;
	hideCardWrapper?: boolean;
	pageSize?: number;
}

export function MentionSection({
	entityType,
	entityId,
	entityName,
	hideCardWrapper,
	pageSize,
}: MentionSectionProps) {
	const [refreshKey, setRefreshKey] = useState(0);

	const handleMentionCreated = () => {
		// Trigger a refresh by updating the key
		setRefreshKey((prev) => prev + 1);
	};

	const headerContent = (
		<>
			<div className="flex items-center gap-2">
				<MessageSquare className="h-5 w-5 text-primary" />
				<h3 className="text-lg font-semibold text-foreground">
					Team Communication
				</h3>
			</div>
			<p className="text-sm text-muted-foreground mt-1">
				Mention team members to notify them about this {entityType}
			</p>
		</>
	);

	const bodyContent = (
		<div className="space-y-6">
			{/* Message Input */}
			<div className="pb-6 border-b border-border">
				<MentionInput
					entityType={entityType}
					entityId={entityId}
					entityName={entityName}
					onMentionCreated={handleMentionCreated}
				/>
			</div>

			{/* Message Feed */}
			<div key={refreshKey}>
				<MentionFeed entityType={entityType} entityId={entityId} pageSize={pageSize} />
			</div>
		</div>
	);

	if (hideCardWrapper) {
		return (
			<div>
				<div className="mb-4">{headerContent}</div>
				{bodyContent}
			</div>
		);
	}

	return (
		<StyledCard>
			<StyledCardHeader>
				{headerContent}
			</StyledCardHeader>
			<StyledCardContent className="space-y-6">
				{bodyContent}
			</StyledCardContent>
		</StyledCard>
	);
}


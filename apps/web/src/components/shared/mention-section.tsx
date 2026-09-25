"use client";

import { useState } from "react";
import { MentionInput } from "./mention-input";
import { MentionFeed } from "./mention-feed";
import {
	GlassCard,
	GlassCardHeader,
	GlassCardContent,
} from "@/components/shared/glass-card";
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
		setRefreshKey((prev) => prev + 1);
	};

	const headerContent = (
		<>
			<div className="flex items-center gap-2">
				<MessageSquare className="h-4 w-4 text-muted-foreground" />
				<h3 className="text-sm font-semibold text-foreground">
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
			<div>
				<MentionInput
					entityType={entityType}
					entityId={entityId}
					entityName={entityName}
					onMentionCreated={handleMentionCreated}
				/>
			</div>

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
		<GlassCard>
			<GlassCardHeader>
				{headerContent}
			</GlassCardHeader>
			<GlassCardContent className="space-y-6">
				{bodyContent}
			</GlassCardContent>
		</GlassCard>
	);
}


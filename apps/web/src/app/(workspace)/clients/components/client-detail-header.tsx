"use client";

import { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { Heart, ListTodo, FolderPlus, FileText } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ClientDetailHeaderProps {
	client: Doc<"clients">;
	clientId: string;
	onComposeEmail: () => void;
	onAddTask: () => void;
	onCreateProject: () => void;
	onCreateQuote: () => void;
	hasPrimaryContactEmail: boolean;
}

export function ClientDetailHeader({
	client,
	clientId,
	onComposeEmail,
	onAddTask,
	onCreateProject,
	onCreateQuote,
	hasPrimaryContactEmail,
}: ClientDetailHeaderProps) {
	const toast = useToast();

	// Favorite functionality
	const isFavorited = useQuery(api.favorites.isFavorited, {
		clientId: clientId as Id<"clients">,
	});
	const toggleFavorite = useMutation(api.favorites.toggle);

	const handleToggleFavorite = async () => {
		try {
			const result = await toggleFavorite({
				clientId: clientId as Id<"clients">,
			});
			if (result.action === "added") {
				toast.success("Added to favorites");
			} else {
				toast.success("Removed from favorites");
			}
		} catch {
			toast.error("Failed to update favorites");
		}
	};

	return (
		<div className="border-b border-border pb-4 mb-0">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<h1 className="text-2xl font-bold text-foreground truncate">
						{client.companyName}
					</h1>
					<ProminentStatusBadge
						status={client.status}
						size="large"
						showIcon={true}
						entityType="client"
					/>
					<button
						onClick={handleToggleFavorite}
						className={cn(
							"p-1.5 rounded-md transition-colors shrink-0",
							"hover:bg-muted",
							"focus:outline-none focus:ring-2 focus:ring-rose-500/50"
						)}
						aria-label={
							isFavorited ? "Remove from favorites" : "Add to favorites"
						}
					>
						<Heart
							className={cn(
								"h-5 w-5 transition-colors",
								isFavorited
									? "fill-rose-500 text-rose-500"
									: "text-muted-foreground hover:text-rose-400"
							)}
						/>
					</button>
				</div>

				{/* Right side - Quick action buttons */}
				<div className="flex items-center gap-2 shrink-0">
					<StyledButton
						intent="outline"
						size="sm"
						onClick={onAddTask}
						icon={<ListTodo className="h-4 w-4" />}
						label="Create Task"
						showArrow={false}
					/>
					<StyledButton
						intent="outline"
						size="sm"
						onClick={onCreateProject}
						icon={<FolderPlus className="h-4 w-4" />}
						label="Create Project"
						showArrow={false}
					/>
					<StyledButton
						intent="outline"
						size="sm"
						onClick={onCreateQuote}
						icon={<FileText className="h-4 w-4" />}
						label="Create Quote"
						showArrow={false}
					/>
					{hasPrimaryContactEmail && (
						<StyledButton
							intent="outline"
							size="sm"
							onClick={onComposeEmail}
							icon={<EnvelopeIcon className="h-4 w-4" />}
							label="Compose Email"
							showArrow={false}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

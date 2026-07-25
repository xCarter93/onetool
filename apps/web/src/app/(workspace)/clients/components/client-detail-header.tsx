"use client";

import { useState } from "react";
import { Id, Doc } from "@onetool/backend/convex/_generated/dataModel";
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { ProminentStatusBadge } from "@/components/shared/prominent-status-badge";
import { StickyDetailHeader } from "@/components/shared/sticky-detail-header";
import { Heart, ListTodo, FolderPlus, FileText, Route } from "lucide-react";
import {
	ActionButtonGroup,
	type RecordAction,
} from "@/components/domain/action-button-group";
import {
	ChooseRoutePropertyDialog,
	isRoutableProperty,
	useAddToRoute,
} from "@/components/shared/add-to-route";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

interface ClientDetailHeaderProps {
	client: Doc<"clients">;
	clientId: string;
	/** All of this client's properties; undefined while still loading. */
	properties: Doc<"clientProperties">[] | undefined;
	onComposeEmail: () => void;
	onAddTask: () => void;
	onCreateProject: () => void;
	onCreateQuote: () => void;
	hasPrimaryContactEmail: boolean;
}

export function ClientDetailHeader({
	client,
	clientId,
	properties,
	onComposeEmail,
	onAddTask,
	onCreateProject,
	onCreateQuote,
	hasPrimaryContactEmail,
}: ClientDetailHeaderProps) {
	const toast = useToast();
	const { can } = usePermissions();
	const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
	const {
		addToRoute,
		isAdding,
		disabled: routeDisabled,
		disabledReason: routeDisabledReason,
	} = useAddToRoute();

	// A client can span several sites, so pick one unless there's only one.
	// Undefined properties means "still loading" — don't blame the client for
	// an address the query hasn't returned yet.
	const propertiesLoading = properties === undefined;
	const allProperties = properties ?? [];
	const routableProperties = allProperties.filter(isRoutableProperty);
	const routeBlockedReason = propertiesLoading
		? undefined
		: (routeDisabledReason ??
			(routableProperties.length === 0
				? allProperties.length > 0
					? "None of this client's addresses are mapped yet"
					: "This client has no property address"
				: undefined));

	const handleAddToRoute = async (propertyId: Id<"clientProperties">) => {
		const ok = await addToRoute({ propertyId, clientId: client._id });
		if (ok) setIsPropertyPickerOpen(false);
	};

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

	const actions: RecordAction[] = [
		{
			key: "create-task",
			label: "Create Task",
			icon: <ListTodo className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onAddTask,
			disabled: !can("tasks", "modify"),
		},
		{
			key: "create-project",
			label: "Create Project",
			icon: <FolderPlus className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onCreateProject,
			disabled: !can("projects", "modify"),
		},
		{
			key: "create-quote",
			label: "Create Quote",
			icon: <FileText className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onCreateQuote,
			disabled: !can("quotes", "modify"),
		},
		{
			key: "add-to-route",
			label: "Add to Route",
			icon: <Route className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: () => {
				if (routableProperties.length === 1) {
					void handleAddToRoute(routableProperties[0]._id);
				} else {
					setIsPropertyPickerOpen(true);
				}
			},
			loading: isAdding,
			loadingLabel: "Adding…",
			disabled: propertiesLoading || routeDisabled || !!routeBlockedReason,
			disabledReason: routeBlockedReason,
		},
		{
			key: "compose-email",
			label: "Compose Email",
			icon: <EnvelopeIcon className="h-4 w-4" />,
			slot: "secondary",
			variant: "outline",
			onClick: onComposeEmail,
			disabled: !can("inbox", "modify"),
			hidden: !hasPrimaryContactEmail,
		},
	];

	return (
		<>
			<ChooseRoutePropertyDialog
				open={isPropertyPickerOpen}
				onOpenChange={setIsPropertyPickerOpen}
				properties={routableProperties}
				onConfirm={(propertyId) => void handleAddToRoute(propertyId)}
				isAdding={isAdding}
			/>
			<StickyDetailHeader>
				{(isSticky) => (
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-3 min-w-0 flex-1">
							<h1
								className={cn(
									"font-bold text-foreground truncate transition-all duration-300",
									isSticky ? "text-lg" : "text-2xl"
								)}
							>
								{client.companyName}
							</h1>
							<ProminentStatusBadge
								status={client.status}
								size={isSticky ? "default" : "large"}
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
						<ActionButtonGroup actions={actions} className="shrink-0" />
					</div>
				)}
			</StickyDetailHeader>
		</>
	);
}

"use client";

import * as React from "react";
import { Heart, X, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useQuery, useMutation } from "convex/react";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_FAVORITES = 3;

export function NavFavorites() {
	const isOrgSwitching = useIsOrgSwitching();
	const favorites = useQuery(api.favorites.list);
	const toggleFavorite = useMutation(api.favorites.toggle);
	const [popoverOpen, setPopoverOpen] = React.useState(false);
	const router = useRouter();

	// Suppress data during the switch grace window so the previous org's
	// favorites don't flash before the new org's list resolves.
	const isLoading = isOrgSwitching || favorites === undefined;
	const visibleFavorites = isLoading
		? []
		: favorites.slice(0, MAX_VISIBLE_FAVORITES);
	const hasOverflow = !isLoading && favorites.length > MAX_VISIBLE_FAVORITES;
	const isEmpty = !isLoading && favorites.length === 0;

	const handleUnfavorite = async (clientId: Id<"clients">) => {
		await toggleFavorite({ clientId });
	};

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Favorites</SidebarGroupLabel>
			<SidebarMenu>
				{isLoading ? (
					Array.from({ length: 2 }).map((_, i) => (
						<SidebarMenuItem key={`favorite-skeleton-${i}`}>
							<div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
								<Skeleton className="size-4 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-32" />
							</div>
						</SidebarMenuItem>
					))
				) : isEmpty ? (
					<SidebarMenuItem>
						<div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
							No favorites yet
						</div>
					</SidebarMenuItem>
				) : (
					<>
						{visibleFavorites.map((favorite) => (
							<SidebarMenuItem key={favorite._id}>
								<SidebarMenuButton
									tooltip={favorite.companyName}
									onClick={() => router.push(`/clients/${favorite.clientId}`)}
								>
									<Heart className="fill-rose-500 text-rose-500" />
									<span className="truncate">{favorite.companyName}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</>
				)}

				{hasOverflow && favorites && (
					<SidebarMenuItem>
						<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
							<PopoverTrigger render={<SidebarMenuButton />}>
								<ChevronRight
									className={cn(
										"transition-transform duration-200",
										popoverOpen && "rotate-90"
									)}
								/>
								<span>View all ({favorites.length})</span>
							</PopoverTrigger>
							<PopoverContent
								side="right"
								align="start"
								sideOffset={8}
								className="w-72 p-0"
							>
								<div className="px-3 py-2 border-b">
									<p className="text-sm font-medium">All Favorites</p>
									<p className="text-xs text-muted-foreground">
										{favorites.length} favorite{favorites.length !== 1 ? "s" : ""}
									</p>
								</div>
								<ScrollArea className="max-h-80">
									<div className="p-1">
										{favorites.map((favorite) => (
											<div
												key={favorite._id}
												className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
											>
												<Heart className="size-4 shrink-0 fill-rose-500 text-rose-500" />
												<Link
													href={`/clients/${favorite.clientId}`}
													className="flex-1 truncate text-sm"
													onClick={() => setPopoverOpen(false)}
												>
													{favorite.companyName}
												</Link>
												<Button
													variant="ghost"
													size="icon-xs"
													className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
													onClick={() => handleUnfavorite(favorite.clientId)}
												>
													<X className="size-3" />
													<span className="sr-only">Remove from favorites</span>
												</Button>
											</div>
										))}
									</div>
								</ScrollArea>
							</PopoverContent>
						</Popover>
					</SidebarMenuItem>
				)}
			</SidebarMenu>
		</SidebarGroup>
	);
}

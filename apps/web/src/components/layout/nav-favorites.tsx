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
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_FAVORITES = 3;

export function NavFavorites() {
	const favorites = useQuery(api.favorites.list);
	const toggleFavorite = useMutation(api.favorites.toggle);
	const [popoverOpen, setPopoverOpen] = React.useState(false);
	const router = useRouter();

	// Don't render anything if no favorites or loading
	if (!favorites || favorites.length === 0) {
		return null;
	}

	const visibleFavorites = favorites.slice(0, MAX_VISIBLE_FAVORITES);
	const hasOverflow = favorites.length > MAX_VISIBLE_FAVORITES;

	const handleUnfavorite = async (clientId: string) => {
		await toggleFavorite({ clientId: clientId as never });
	};

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Favorites</SidebarGroupLabel>
			<SidebarMenu>
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

				{hasOverflow && (
					<SidebarMenuItem>
						<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
							<PopoverTrigger asChild>
								<SidebarMenuButton>
									<ChevronRight
										className={cn(
											"transition-transform duration-200",
											popoverOpen && "rotate-90"
										)}
									/>
									<span>View all ({favorites.length})</span>
								</SidebarMenuButton>
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
													intent="plain"
													size="sq-xs"
													className="size-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
													onPress={() => handleUnfavorite(favorite.clientId)}
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

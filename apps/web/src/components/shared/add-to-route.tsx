"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PropertyPicker } from "@/components/shared/property-picker";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { todayUtcMidnightMs } from "@/lib/dates";

type ClientProperty = Doc<"clientProperties">;

/** Only geocoded properties can become route stops. */
export function isRoutableProperty(property: ClientProperty): boolean {
	return property.latitude != null && property.longitude != null;
}

/**
 * Detail-page "Add to today's route" on-ramp (PRD §9 D8). Wraps
 * `routes.addPropertyStop`, which upserts the daily route for today and
 * dedupes by property, so callers only supply what to add.
 */
export function useAddToRoute() {
	const router = useRouter();
	const toast = useToast();
	const { can } = usePermissions();
	const { allows, isLoading: accessLoading } = useEntitlements();
	const hasPremiumAccess = allows("routing");
	const addPropertyStop = useMutation(api.routes.addPropertyStop);
	const [isAdding, setIsAdding] = useState(false);

	const disabledReason = !can("clients")
		? "You don't have permission to view client addresses"
		: !hasPremiumAccess
			? "Route planning is available on the Business plan"
			: undefined;

	const addToRoute = async (args: {
		propertyId?: Id<"clientProperties">;
		clientId?: Id<"clients">;
		projectId?: Id<"projects">;
	}): Promise<boolean> => {
		setIsAdding(true);
		try {
			const result = await addPropertyStop({
				date: todayUtcMidnightMs(),
				...args,
			});
			const viewRoute = {
				label: "View route",
				onClick: () => router.push("/routing"),
			};
			if (result.added) {
				toast.success(
					`Added ${result.label} to today's route`,
					`${result.stopCount} ${result.stopCount === 1 ? "stop" : "stops"} planned`,
					{ action: viewRoute }
				);
			} else {
				toast.info(`${result.label} is already on today's route`, undefined, {
					action: viewRoute,
				});
			}
			return true;
		} catch (error) {
			toast.error(
				"Couldn't add to route",
				error instanceof Error ? error.message : undefined
			);
			return false;
		} finally {
			setIsAdding(false);
		}
	};

	return {
		addToRoute,
		isAdding,
		disabled: accessLoading || isAdding || !!disabledReason,
		disabledReason,
	};
}

/**
 * Property chooser for records that span several addresses (a client). Records
 * with a single routable property never see this — they add straight away.
 */
export function ChooseRoutePropertyDialog({
	open,
	onOpenChange,
	properties,
	onConfirm,
	isAdding,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	properties: ClientProperty[];
	onConfirm: (propertyId: Id<"clientProperties">) => void;
	isAdding: boolean;
}) {
	const [selected, setSelected] = useState<Id<"clientProperties"> | "">("");

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setSelected("");
				onOpenChange(next);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add to today&apos;s route</DialogTitle>
					<DialogDescription>
						Choose which property to visit. Only properties with a mapped
						address can be routed to.
					</DialogDescription>
				</DialogHeader>
				<PropertyPicker
					properties={properties}
					value={selected}
					onChange={setSelected}
					placeholder="Select a property"
					disabled={isAdding}
				/>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isAdding}
					>
						Cancel
					</Button>
					<Button
						onClick={() => selected && onConfirm(selected)}
						disabled={!selected || isAdding}
					>
						{isAdding ? "Adding…" : "Add stop"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

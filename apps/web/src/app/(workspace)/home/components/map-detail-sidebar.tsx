"use client";

import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X, MapPin } from "lucide-react";
import { StyledButton } from "@/components/ui/styled/styled-button";

interface PropertyDetails {
	id: string;
	clientId: string;
	clientCompanyName: string;
	propertyName?: string;
	address: string;
}

interface MapDetailSidebarProps {
	property: PropertyDetails | null;
	onClose: () => void;
}

export function MapDetailSidebar({
	property,
	onClose,
}: MapDetailSidebarProps) {
	const router = useRouter();

	return (
		<AnimatePresence>
			{property !== null && (
				<div className="absolute inset-y-0 right-0 w-[260px] z-20">
					<motion.div
						key={property.id}
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						className="h-full bg-card border-l border-border p-4 overflow-y-auto"
					>
						{/* Close button */}
						<button
							aria-label="Close details"
							onClick={onClose}
							className="absolute top-3 right-3 h-6 w-6 flex items-center justify-center rounded-sm hover:bg-muted transition-colors"
						>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>

						{/* Property icon */}
						<div className="mt-2">
							<MapPin className="h-5 w-5 text-primary" />
						</div>

						{/* Address */}
						<p className="text-sm font-semibold text-foreground leading-snug mt-2 line-clamp-2">
							{property.address}
						</p>

						{/* Property name */}
						{property.propertyName && (
							<p className="text-xs text-muted-foreground mt-1">
								{property.propertyName}
							</p>
						)}

						{/* Client name */}
						<p className="text-xs text-muted-foreground mt-1 truncate">
							{property.clientCompanyName}
						</p>

						{/* Divider */}
						<hr className="border-border my-3" />

						{/* View Client CTA */}
						<StyledButton
							intent="primary"
							size="sm"
							className="w-full"
							onClick={() =>
								router.push(`/clients/${property.clientId}`)
							}
							showArrow={false}
						>
							View Client
						</StyledButton>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}

export type { PropertyDetails };

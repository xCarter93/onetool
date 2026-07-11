import { ReactNode, Fragment } from "react";
import { Loader2 } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface ButtonConfig {
	label: string;
	onClick?: () => void;
	intent?:
		| "primary"
		| "outline"
		| "secondary"
		| "warning"
		| "plain"
		| "success"
		| "destructive";
	size?: "sm" | "md" | "lg";
	icon?: ReactNode;
	isLoading?: boolean;
	disabled?: boolean;
	type?: "button" | "submit";
	position?: "left" | "right";
	customComponent?: (button: ReactNode) => ReactNode; // Wrapper for button (e.g., Popover)
}

interface StickyFormFooterProps {
	buttons?: ButtonConfig[];
	// Legacy props for backward compatibility
	onCancel?: () => void;
	onSave?: () => void;
	cancelText?: string;
	saveText?: string;
	isLoading?: boolean;
	className?: string;
	fullWidth?: boolean;
	hasUnsavedChanges?: boolean;
	isEditing?: boolean;
}

// TODO(reui-rebuild): nova Button has no "success" or "warning" variant —
// "success" maps to default, "warning" maps to outline.
function intentToVariant(
	intent: ButtonConfig["intent"]
): "default" | "outline" | "secondary" | "ghost" | "destructive" {
	switch (intent) {
		case "primary":
		case "success":
			return "default";
		case "secondary":
			return "secondary";
		case "plain":
			return "ghost";
		case "destructive":
			return "destructive";
		case "outline":
		case "warning":
		default:
			return "outline";
	}
}

function toButtonSize(size: ButtonConfig["size"]): "default" | "sm" | "lg" {
	if (size === "sm") return "sm";
	if (size === "lg") return "lg";
	return "default";
}

export function StickyFormFooter({
	buttons,
	onCancel,
	onSave,
	cancelText = "Cancel",
	saveText = "Save",
	isLoading = false,
	className = "",
	fullWidth = false,
	hasUnsavedChanges = false,
	isEditing = false,
}: StickyFormFooterProps) {
	const sidebar = useSidebar();

	// Use new button config if provided, otherwise fall back to legacy props
	const buttonConfigs: ButtonConfig[] = buttons || [
		...(onCancel
			? [
					{
						label: cancelText,
						onClick: onCancel,
						intent: "outline" as const,
						disabled: isLoading,
					},
				]
			: []),
		...(onSave
			? [
					{
						label: isLoading ? "Saving..." : saveText,
						onClick: onSave,
						intent: "primary" as const,
						type: "submit" as const,
						disabled: isLoading,
					},
				]
			: []),
	];

	if (buttonConfigs.length === 0) return null;

	// Calculate sidebar width based on state
	const getSidebarWidth = () => {
		if (!sidebar || sidebar.isMobile) return "0px";
		return sidebar.state === "expanded"
			? "var(--sidebar-width, 18rem)"
			: "var(--sidebar-width-icon, 3rem)";
	};

	// Always use fixed positioning to stick to bottom of viewport
	const sidebarWidth = getSidebarWidth();

	return (
		<div
			className={`fixed bottom-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg ${className} transition-[left] duration-200 ease-linear`}
			style={{
				left: sidebarWidth,
			}}
		>
			<div className={fullWidth ? "w-full px-6" : "w-full px-6"}>
				<div className="w-full">
					<div className="flex items-center justify-between gap-x-3 py-4 flex-wrap">
						{/* Left side buttons */}
						<div className="flex items-center gap-x-3 flex-wrap">
							{buttonConfigs
								.filter(
									(button) => !button.position || button.position === "left"
								)
								.map((button, index) => {
									const buttonElement = (
										<Button
											onClick={button.onClick}
											variant={intentToVariant(button.intent)}
											size={toButtonSize(button.size)}
											disabled={button.disabled || button.isLoading}
											type={button.type}
										>
											{button.isLoading ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												button.icon
											)}
											{button.label}
										</Button>
									);
									return (
										<Fragment key={`left-${index}`}>
											{button.customComponent
												? button.customComponent(buttonElement)
												: buttonElement}
										</Fragment>
									);
								})}
						</div>

						{/* Unsaved Changes Notification - Centered */}
						{isEditing && hasUnsavedChanges && (
							<div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 border-2 border-yellow-400 dark:border-yellow-600 shrink-0 shadow-md animate-pulse">
								<div className="w-2.5 h-2.5 bg-yellow-500 rounded-full shrink-0 animate-pulse" />
								<div className="flex flex-col">
									<p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 leading-tight">
										Unsaved changes
									</p>
									<p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 leading-tight">
										Save or cancel your changes
									</p>
								</div>
							</div>
						)}

						{/* Right side buttons */}
						<div className="flex items-center gap-x-3 flex-wrap">
							{buttonConfigs
								.filter((button) => button.position === "right")
								.map((button, index) => {
									const buttonElement = (
										<Button
											onClick={button.onClick}
											variant={intentToVariant(button.intent)}
											size={toButtonSize(button.size)}
											disabled={button.disabled || button.isLoading}
											type={button.type}
										>
											{button.isLoading ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												button.icon
											)}
											{button.label}
										</Button>
									);
									return (
										<Fragment key={`right-${index}`}>
											{button.customComponent
												? button.customComponent(buttonElement)
												: buttonElement}
										</Fragment>
									);
								})}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

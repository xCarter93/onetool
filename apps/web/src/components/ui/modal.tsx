"use client";

import { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

/**
 * Compat wrapper over ui/dialog (Base UI) preserving the legacy Modal API.
 * The old framer-motion implementation and its z-[9999] stacking hack are
 * gone; layering now comes from Base UI like every other overlay.
 *
 * Deprecated: new code should compose Dialog directly. The `animation` prop
 * is accepted but ignored (nova dialog has one standard transition).
 */
interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	children: ReactNode;
	title?: string;
	size?: "sm" | "md" | "lg" | "xl" | "2xl";
	animation?: "scale" | "slide" | "fade" | "bounce";
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
	sm: "max-w-md",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
	"2xl": "max-w-[70vw]",
};

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	children,
	title,
	size = "md",
}) => {
	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className={cn("max-h-[90vh] overflow-y-auto", sizeClasses[size])}
			>
				{title ? (
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
				) : (
					<DialogTitle className="sr-only">Dialog</DialogTitle>
				)}
				<div className="p-4">{children}</div>
			</DialogContent>
		</Dialog>
	);
};

export default Modal;

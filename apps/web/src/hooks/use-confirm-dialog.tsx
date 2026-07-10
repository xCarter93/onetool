"use client";

import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	ReactNode,
} from "react";
import Modal from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ConfirmDialogOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "destructive" | "warning" | "info";
	itemName?: string;
}

interface ConfirmDialogContextType {
	confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<
	ConfirmDialogContextType | undefined
>(undefined);

interface ConfirmDialogProviderProps {
	children: ReactNode;
}

export const ConfirmDialogProvider: React.FC<ConfirmDialogProviderProps> = ({
	children,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
	const [resolver, setResolver] = useState<((value: boolean) => void) | null>(
		null
	);

	const confirm = useCallback(
		(opts: ConfirmDialogOptions): Promise<boolean> => {
			return new Promise<boolean>((resolve) => {
				setOptions(opts);
				setIsOpen(true);
				setResolver(() => resolve);
			});
		},
		[]
	);

	const handleConfirm = useCallback(() => {
		if (resolver) {
			resolver(true);
			setResolver(null);
		}
		setIsOpen(false);
		setOptions(null);
	}, [resolver]);

	const handleCancel = useCallback(() => {
		if (resolver) {
			resolver(false);
			setResolver(null);
		}
		setIsOpen(false);
		setOptions(null);
	}, [resolver]);

	const getVariantStyles = (variant: string) => {
		switch (variant) {
			case "destructive":
				return {
					iconColor: "text-red-500",
					bgColor: "bg-red-50 dark:bg-red-900/20",
					borderColor: "border-red-200 dark:border-red-800",
					textColor: "text-red-700 dark:text-red-300",
					buttonIntent: "destructive" as const,
				};
			case "warning":
				return {
					iconColor: "text-yellow-500",
					bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
					borderColor: "border-yellow-200 dark:border-yellow-800",
					textColor: "text-yellow-700 dark:text-yellow-300",
					buttonIntent: "warning" as const,
				};
			case "info":
			default:
				return {
					iconColor: "text-blue-500",
					bgColor: "bg-blue-50 dark:bg-blue-900/20",
					borderColor: "border-blue-200 dark:border-blue-800",
					textColor: "text-blue-700 dark:text-blue-300",
					buttonIntent: "primary" as const,
				};
		}
	};

	const variant = options?.variant || "destructive";
	const styles = getVariantStyles(variant);

	const contextValue: ConfirmDialogContextType = {
		confirm,
	};

	return (
		<ConfirmDialogContext.Provider value={contextValue}>
			{children}

			{options && (
				<Modal
					isOpen={isOpen}
					onClose={handleCancel}
					title={options.title}
					size="sm"
				>
					<div className="space-y-4">
						<div className="flex items-center space-x-3">
							<div className="shrink-0">
								<svg
									className={`h-10 w-10 ${styles.iconColor}`}
									fill="none"
									viewBox="0 0 24 24"
									strokeWidth="1.5"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
									/>
								</svg>
							</div>
							<div>
								<h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
									Are you sure?
								</h3>
								<p className="text-sm text-gray-600 dark:text-gray-400">
									{options.message}
									{options.itemName && (
										<>
											{" "}
											<strong>&quot;{options.itemName}&quot;</strong>
										</>
									)}
								</p>
							</div>
						</div>

						{variant === "destructive" && (
							<div
								className={`${styles.bgColor} border ${styles.borderColor} rounded-md p-3`}
								role="alert"
							>
								<div className="flex">
									<div className="shrink-0">
										<svg
											className="h-5 w-5 text-red-400"
											viewBox="0 0 20 20"
											fill="currentColor"
											aria-hidden="true"
										>
											<path
												fillRule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
												clipRule="evenodd"
											/>
										</svg>
									</div>
									<div className="ml-3">
										<p className={`text-sm ${styles.textColor}`}>
											<strong>Warning:</strong> This is a destructive action
											that cannot be reversed.
										</p>
									</div>
								</div>
							</div>
						)}

						<div className="flex justify-end space-x-3">
							<Button
								onClick={handleCancel}
								variant="secondary"
								autoFocus={variant !== "destructive"}
							>
								{options.cancelLabel || "Cancel"}
							</Button>
							<Button
								onClick={handleConfirm}
								// TODO(reui-rebuild): "warning" intent has no base-nova Button
								// variant equivalent; falling back to outline per mapping table.
								variant={
									styles.buttonIntent === "primary"
										? "default"
										: styles.buttonIntent === "warning"
											? "outline"
											: styles.buttonIntent
								}
								autoFocus={variant === "destructive"}
							>
								{options.confirmLabel || "Confirm"}
							</Button>
						</div>
					</div>
				</Modal>
			)}
		</ConfirmDialogContext.Provider>
	);
};

export const useConfirmDialog = (): ConfirmDialogContextType => {
	const context = useContext(ConfirmDialogContext);
	if (!context) {
		throw new Error(
			"useConfirmDialog must be used within a ConfirmDialogProvider"
		);
	}
	return context;
};

"use client";

import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import Notification, {
	NotificationType,
	NotificationPosition,
} from "@/components/ui/toast";

interface Toast {
	id: string;
	type: NotificationType;
	title: string;
	message?: string;
	showIcon?: boolean;
	duration?: number;
}

interface ToastContextType {
	toasts: Toast[];
	addToast: (toast: Omit<Toast, "id">) => string;
	removeToast: (id: string) => void;
	success: (
		title: string,
		message?: string,
		options?: Partial<Toast>
	) => string;
	error: (title: string, message?: string, options?: Partial<Toast>) => string;
	warning: (
		title: string,
		message?: string,
		options?: Partial<Toast>
	) => string;
	info: (title: string, message?: string, options?: Partial<Toast>) => string;
	loading: (
		title: string,
		message?: string,
		options?: Partial<Toast>
	) => string;
	updateToast: (id: string, updates: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
	children: ReactNode;
	position?: NotificationPosition;
	maxToasts?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
	children,
	position = "top-right",
	maxToasts = 5,
}) => {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const pathname = usePathname();
	const [prevPathname, setPrevPathname] = useState(pathname);

	// On navigation, keep only error/warning/loading toasts. Adjusted during
	// render (prev-value pattern) rather than in an effect to avoid an extra commit.
	if (pathname !== prevPathname) {
		setPrevPathname(pathname);
		setToasts((prevToasts) =>
			prevToasts.filter(
				(toast) =>
					toast.type === "error" ||
					toast.type === "warning" ||
					toast.type === "loading"
			)
		);
	}

	const generateId = useCallback(() => {
		return Math.random().toString(36).substring(2) + Date.now().toString(36);
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
	}, []);

	const addToast = useCallback(
		(toast: Omit<Toast, "id">) => {
			const id = generateId();
			const newToast = { ...toast, id };

			setToasts((prevToasts) => {
				const updatedToasts = [newToast, ...prevToasts];
				// Limit the number of toasts
				return updatedToasts.slice(0, maxToasts);
			});

			// Auto-remove toast if duration is specified
			if (toast.duration) {
				setTimeout(() => {
					removeToast(id);
				}, toast.duration);
			}

			return id;
		},
		[generateId, maxToasts, removeToast]
	);

	const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
		setToasts((prevToasts) =>
			prevToasts.map((toast) =>
				toast.id === id ? { ...toast, ...updates } : toast
			)
		);
	}, []);

	// Convenience methods for different toast types
	const success = useCallback(
		(title: string, message?: string, options?: Partial<Toast>) => {
			return addToast({
				type: "success",
				title,
				message,
				duration: 4000,
				...options,
			});
		},
		[addToast]
	);

	const error = useCallback(
		(title: string, message?: string, options?: Partial<Toast>) => {
			return addToast({
				type: "error",
				title,
				message,
				duration: 6000,
				...options,
			});
		},
		[addToast]
	);

	const warning = useCallback(
		(title: string, message?: string, options?: Partial<Toast>) => {
			return addToast({
				type: "warning",
				title,
				message,
				duration: 5000,
				...options,
			});
		},
		[addToast]
	);

	const info = useCallback(
		(title: string, message?: string, options?: Partial<Toast>) => {
			return addToast({
				type: "info",
				title,
				message,
				duration: 4000,
				...options,
			});
		},
		[addToast]
	);

	const loading = useCallback(
		(title: string, message?: string, options?: Partial<Toast>) => {
			return addToast({
				type: "loading",
				title,
				message,
				// Loading toasts don't auto-dismiss by default
				...options,
			});
		},
		[addToast]
	);

	// Position classes for the toast container
	const positionClasses = {
		"top-left": "top-4 left-4",
		"top-right": "top-4 right-4",
		"top-center": "top-4 left-1/2 -translate-x-1/2",
		"bottom-left": "bottom-4 left-4",
		"bottom-right": "bottom-4 right-4",
		"bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
	};

	const contextValue: ToastContextType = {
		toasts,
		addToast,
		removeToast,
		success,
		error,
		warning,
		info,
		loading,
		updateToast,
	};

	return (
		<ToastContext.Provider value={contextValue}>
			{children}
			{/* Toast Container */}
			<div
				className={`fixed z-50 flex flex-col gap-2 w-full max-w-sm ${positionClasses[position]}`}
			>
				<AnimatePresence mode="popLayout">
					{toasts.map((toast) => (
						<Notification
							key={toast.id}
							type={toast.type}
							title={toast.title}
							message={toast.message}
							showIcon={toast.showIcon}
							duration={toast.duration}
							onClose={() => removeToast(toast.id)}
						/>
					))}
				</AnimatePresence>
			</div>
		</ToastContext.Provider>
	);
};

export const useToast = (): ToastContextType => {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
};

// Convenience hook for common patterns
export const useToastOperations = () => {
	const toast = useToast();

	const showLoadingWithSuccess = useCallback(
		async <T,>(
			loadingMessage: string,
			successMessage: string,
			operation: () => Promise<T>
		): Promise<T> => {
			const loadingId = toast.loading("Loading", loadingMessage);

			try {
				const result = await operation();
				toast.removeToast(loadingId);
				toast.success("Success", successMessage);
				return result;
			} catch (error) {
				toast.removeToast(loadingId);
				toast.error(
					"Error",
					error instanceof Error ? error.message : "An error occurred"
				);
				throw error;
			}
		},
		[toast]
	);

	const confirmAction = useCallback(
		(
			action: () => Promise<void>,
			messages: { loading: string; success: string; error?: string }
		) => {
			return showLoadingWithSuccess(messages.loading, messages.success, action);
		},
		[showLoadingWithSuccess]
	);

	return {
		...toast,
		showLoadingWithSuccess,
		confirmAction,
	};
};

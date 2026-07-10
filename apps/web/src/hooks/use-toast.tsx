"use client";

import React, {
	ReactNode,
	createContext,
	useContext,
	useEffect,
	useRef,
} from "react";
import { usePathname } from "next/navigation";
import { toast as sonnerToast } from "sonner";

import { Toaster } from "@/components/ui/sonner";

/**
 * Sonner-backed adapter preserving the legacy custom-toast API exactly —
 * consumers (61 files) are untouched. The old ui/toast.tsx renderer is gone.
 */

export type NotificationType =
	| "info"
	| "success"
	| "warning"
	| "error"
	| "loading";

export type NotificationPosition =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "top-center"
	| "bottom-center";

export interface Toast {
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
	success: (title: string, message?: string, options?: Partial<Toast>) => string;
	error: (title: string, message?: string, options?: Partial<Toast>) => string;
	warning: (title: string, message?: string, options?: Partial<Toast>) => string;
	info: (title: string, message?: string, options?: Partial<Toast>) => string;
	loading: (title: string, message?: string, options?: Partial<Toast>) => string;
	updateToast: (id: string, updates: Partial<Toast>) => void;
}

// Per-type default durations carried over from the old implementation.
const DEFAULT_DURATION: Record<NotificationType, number | undefined> = {
	success: 4000,
	error: 6000,
	warning: 5000,
	info: 4000,
	loading: undefined, // loading toasts persist until dismissed
};

// The old provider dismissed transient (info/success) toasts on route change
// while keeping error/warning/loading. Sonner has no query API, but every
// toast flows through this adapter, so we track ids by type ourselves.
const liveTransientIds = new Set<string>();

function show(
	type: NotificationType,
	title: string,
	message?: string,
	options?: Partial<Toast>
): string {
	const duration = options?.duration ?? DEFAULT_DURATION[type];
	const id = sonnerToast[type](title, {
		description: options?.message ?? message,
		// sonner treats undefined as "use Toaster default"; loading toasts get
		// Infinity to persist like the old implementation.
		duration: duration ?? (type === "loading" ? Infinity : undefined),
	});
	const stringId = String(id);
	if (type === "info" || type === "success") {
		liveTransientIds.add(stringId);
		if (duration) {
			setTimeout(() => liveTransientIds.delete(stringId), duration + 1000);
		}
	}
	return stringId;
}

const api: ToastContextType = {
	// No consumer reads the raw array (verified inventory 2026-07-10).
	toasts: [],
	addToast: ({ type, title, message, duration }) =>
		show(type, title, message, { duration }),
	removeToast: (id) => {
		sonnerToast.dismiss(id);
		liveTransientIds.delete(id);
	},
	success: (title, message, options) => show("success", title, message, options),
	error: (title, message, options) => show("error", title, message, options),
	warning: (title, message, options) => show("warning", title, message, options),
	info: (title, message, options) => show("info", title, message, options),
	loading: (title, message, options) => show("loading", title, message, options),
	updateToast: (id, updates) => {
		// Zero consumers today; best-effort re-render under the same id.
		const type = updates.type ?? "info";
		sonnerToast[type](updates.title ?? "", {
			id,
			description: updates.message,
			duration: updates.duration ?? DEFAULT_DURATION[type],
		});
	},
};

interface ToastProviderProps {
	children: ReactNode;
	position?: NotificationPosition;
	maxToasts?: number;
}

// Sonner's toast store is a global singleton: nested providers (root layout
// AND portal layout both mount one) must not each render a Toaster, or every
// toast appears twice. Only the outermost provider mounts it.
const HasToasterContext = createContext(false);

export const ToastProvider: React.FC<ToastProviderProps> = ({
	children,
	position = "top-right",
	maxToasts = 5,
}) => {
	const hasAncestorToaster = useContext(HasToasterContext);
	const pathname = usePathname();
	const previousPathname = useRef(pathname);

	useEffect(() => {
		if (hasAncestorToaster) return;
		if (previousPathname.current !== pathname) {
			previousPathname.current = pathname;
			// Route change: drop transient toasts, keep error/warning/loading.
			for (const id of liveTransientIds) {
				sonnerToast.dismiss(id);
			}
			liveTransientIds.clear();
		}
	}, [pathname, hasAncestorToaster]);

	if (hasAncestorToaster) {
		return <>{children}</>;
	}

	return (
		<HasToasterContext.Provider value={true}>
			{children}
			<Toaster position={position} visibleToasts={maxToasts} />
		</HasToasterContext.Provider>
	);
};

export const useToast = (): ToastContextType => api;

export const useToastOperations = () => {
	return {
		...api,
		showLoadingWithSuccess: async <T,>(
			loadingMessage: string,
			successMessage: string,
			operation: () => Promise<T>
		): Promise<T> => {
			const id = api.loading(loadingMessage);
			try {
				const result = await operation();
				api.removeToast(id);
				api.success(successMessage);
				return result;
			} catch (err) {
				api.removeToast(id);
				api.error(
					"Operation failed",
					err instanceof Error ? err.message : "An unexpected error occurred"
				);
				throw err;
			}
		},
		confirmAction: async (
			action: () => Promise<void>,
			messages: { loading: string; success: string; error?: string }
		): Promise<void> => {
			const id = api.loading(messages.loading);
			try {
				await action();
				api.removeToast(id);
				api.success(messages.success);
			} catch (err) {
				api.removeToast(id);
				api.error(
					messages.error ?? "Action failed",
					err instanceof Error ? err.message : "An unexpected error occurred"
				);
				throw err;
			}
		},
	};
};

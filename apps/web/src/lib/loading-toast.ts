type LoadingToastApi = {
	loading: (title: string, message?: string) => string;
	removeToast: (id: string) => void;
};

export async function runWithLoadingToast<T>(
	toast: LoadingToastApi,
	title: string,
	message: string,
	operation: () => Promise<T>
): Promise<T> {
	const id = toast.loading(title, message);
	try {
		return await operation();
	} finally {
		toast.removeToast(id);
	}
}

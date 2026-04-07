"use client";

interface UndoBannerProps {
	title: string;
	message: string;
	onUndo: () => void;
}

export function UndoBanner({ title, message, onUndo }: UndoBannerProps) {
	return (
		<div className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2">
			<button
				type="button"
				onClick={onUndo}
				className="rounded-lg bg-foreground px-4 py-3 text-left text-background shadow-lg transition-opacity hover:opacity-90"
			>
				<div className="text-sm font-semibold">{title}</div>
				<div className="text-xs opacity-80">{message}</div>
				<div className="mt-1 text-sm font-semibold underline">Undo</div>
			</button>
		</div>
	);
}

"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function FutureSetupSection({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="mb-5 rounded-lg border border-border" aria-labelledby={id}>
			<div className="border-b border-border px-4 py-3">
				<h4 id={id} className="text-sm font-medium text-foreground">
					{title}
				</h4>
				<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
			</div>
			<ul className="divide-y divide-border">{children}</ul>
		</section>
	);
}

export function FutureSetupItem({
	children,
	action,
}: {
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<li className="flex min-h-12 items-center gap-3 px-4 py-2">
			<div className="min-w-0 flex-1">{children}</div>
			{action}
		</li>
	);
}

export function SetupErrorAlert({
	message,
	onRetry,
}: {
	message: string;
	onRetry?: () => void;
}) {
	return (
		<div
			role="alert"
			className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
		>
			<p>{message}</p>
			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					className="mt-3 min-h-11"
					onClick={onRetry}
				>
					Review latest changes
				</Button>
			)}
		</div>
	);
}

import type { ElementType } from "react";
import { Badge } from "@/components/reui/badge";
import { CheckCircle2, XCircle, Loader2, MinusCircle, Ban } from "lucide-react";
import { RUN_STATUS_META, type RunStatus } from "../lib/run-format";

const STATUS_ICON: Record<RunStatus, ElementType> = {
	running: Loader2,
	completed: CheckCircle2,
	failed: XCircle,
	skipped: MinusCircle,
	cancelled: Ban,
};

/**
 * Run status shown as icon + label + color — never color alone (WCAG "color only").
 * The running spinner respects prefers-reduced-motion.
 */
export function RunStatusBadge({
	status,
	className,
}: {
	status: RunStatus;
	className?: string;
}) {
	const meta = RUN_STATUS_META[status] ?? RUN_STATUS_META.skipped;
	const Icon = STATUS_ICON[status] ?? MinusCircle;
	return (
		<Badge variant={meta.badge} className={className}>
			<Icon
				aria-hidden
				className={
					status === "running"
						? "animate-spin motion-reduce:animate-none"
						: undefined
				}
			/>
			{meta.label}
		</Badge>
	);
}

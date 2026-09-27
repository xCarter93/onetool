import { FileText, Receipt } from "lucide-react-native";
import { MetricStrip, type MetricCell } from "@/components/canvas";
import { formatCurrency } from "@/lib/format";

/**
 * At-a-glance quoted/unpaid totals — the only place on Money that shows the
 * quoted-awaiting-approval figure, so it earns its spot above the chart.
 */
export function PipelineStrip({
	awaitingCount,
	awaitingTotal,
	unpaidCount,
	unpaidTotal,
	onPressAwaiting,
	onPressUnpaid,
}: {
	awaitingCount: number;
	awaitingTotal: number;
	unpaidCount: number;
	unpaidTotal: number;
	onPressAwaiting?: () => void;
	onPressUnpaid?: () => void;
}) {
	const cells: MetricCell[] = [
		{
			icon: FileText,
			label: `Quoted · ${awaitingCount} ${awaitingCount === 1 ? "quote" : "quotes"}`,
			value: formatCurrency(awaitingTotal),
			onPress: onPressAwaiting,
		},
		{
			icon: Receipt,
			label: `Unpaid · ${unpaidCount} ${unpaidCount === 1 ? "invoice" : "invoices"}`,
			value: formatCurrency(unpaidTotal),
			onPress: onPressUnpaid,
		},
	];

	return <MetricStrip cells={cells} />;
}

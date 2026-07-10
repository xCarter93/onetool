export type MetricDefinition = {
	key: string;
	label: string;
	value: number;
	previousValue: number;
	format: (val: number) => string;
	isNegative?: boolean;
	changeType?: "increase" | "decrease" | "neutral";
	changePercent?: number;
	isLoading?: boolean;
	subtitle?: string;
};

export type MetricDatum = { date: string } & Record<string, number>;

export type MetricDataMap = Record<string, MetricDatum[]>;

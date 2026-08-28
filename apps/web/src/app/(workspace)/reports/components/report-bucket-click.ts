/** Opens the contributing-data sheet scoped to one chart bucket (R10). */
export type BucketClickHandler = (bucketKey: string, bucketLabel: string) => void;

/**
 * Wraps a bucket handler for a recharts element click. Recharts hands either the
 * datum itself or a shape whose `payload` is the datum; ungrouped points carry no
 * bucketKey and are ignored so a click can't drill into a scope the server rejects.
 */
export function bucketElementClick(onBucketClick: BucketClickHandler | undefined) {
	if (!onBucketClick) return undefined;
	return (entry: unknown) => {
		const datum = (entry as { payload?: unknown } | undefined)?.payload ?? entry;
		const { bucketKey, name } = (datum ?? {}) as {
			bucketKey?: string;
			name?: string;
		};
		if (bucketKey) onBucketClick(bucketKey, name ?? bucketKey);
	};
}

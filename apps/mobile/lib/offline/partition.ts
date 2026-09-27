// Offline outbox partition key — scopes queued ops to one deployment+user+org triple.

export type PartitionIdentity = { deploymentUrl: string; userId: string; orgId: string };

// encodeURIComponent escapes "|" to %7C, so a part containing the delimiter
// can't shift the join boundary and collide with a different triple.
export function partitionKey(id: PartitionIdentity): string {
	for (const [key, value] of Object.entries(id)) {
		if (!value) throw new Error(`partitionKey: empty ${key}`);
	}
	return [id.deploymentUrl, id.userId, id.orgId].map(encodeURIComponent).join("|");
}

import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

/**
 * Aggregate definitions for efficient home stats calculations
 * These provide O(log n) counting and summing instead of O(n)
 */

/**
 * Client counts by creation time
 * Allows efficient counting of clients created in any time range
 */
export const clientCountsAggregate = new TableAggregate<{
	Namespace: string; // orgId as string
	Key: number; // _creationTime
	DataModel: DataModel;
	TableName: "clients";
}>(components.clientCounts, {
	namespace: (doc) => doc.orgId,
	sortKey: (doc) => doc._creationTime,
});

/**
 * Project counts by status and completion time
 * Allows efficient counting of completed projects in any time range
 */
export const projectCountsAggregate = new TableAggregate<{
	Namespace: string;
	Key: [string, number]; // [status, completedAt || 0]
	DataModel: DataModel;
	TableName: "projects";
}>(components.projectCounts, {
	namespace: (doc) => doc.orgId,
	sortKey: (doc) => [doc.status, doc.completedAt || 0],
});

/**
 * Quote counts by status and approval time
 * Allows efficient counting of approved quotes in any time range
 */
export const quoteCountsAggregate = new TableAggregate<{
	Namespace: string;
	Key: [string, number]; // [status, approvedAt || 0]
	Value: number; // quote total for value aggregation
	DataModel: DataModel;
	TableName: "quotes";
}>(components.quoteCounts, {
	namespace: (doc) => doc.orgId,
	sortKey: (doc) => [doc.status, doc.approvedAt || 0],
	sumValue: (doc) => doc.total, // Sum quote totals
});

/**
 * Invoice revenue tracking by status and payment time
 * Allows efficient summing of invoice totals in any time range
 */
export const invoiceRevenueAggregate = new TableAggregate<{
	Namespace: string;
	Key: [string, number]; // [status, paidAt || 0]
	Value: number; // invoice total
	DataModel: DataModel;
	TableName: "invoices";
}>(components.invoiceRevenue, {
	namespace: (doc) => doc.orgId,
	sortKey: (doc) => [doc.status, doc.paidAt || 0],
	sumValue: (doc) => doc.total, // Sum invoice totals
});

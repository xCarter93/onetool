import { Feature } from "../bento/feature";
import { ImportCell } from "../bento/import-cell";
import { SyncCell } from "../bento/sync-cell";

export function FaqFeatures() {
	return (
		<>
			<Feature
				as="h3"
				title="Start from your spreadsheet"
				body="Upload a CSV and OneTool matches its columns to client fields, skips names you already have and adds the rest."
				label="The Map columns step matching spreadsheet columns such as Customer Name and Gate Code to client fields, each with a confidence level."
				stageClassName="h-72 bg-(--sheet)"
			>
				<ImportCell />
			</Feature>
			<Feature
				as="h3"
				title="Your books stay in QuickBooks"
				body="On the Business plan, clients, invoices, payments and refunds sync to QuickBooks Online, so nobody retypes them at month end."
				label="A connected QuickBooks Online account showing when clients, invoices, payments and refunds sync, with no sync issues."
				stageClassName="h-72 bg-(--sheet)"
			>
				<SyncCell />
			</Feature>
		</>
	);
}

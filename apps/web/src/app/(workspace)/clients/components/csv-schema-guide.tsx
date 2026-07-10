"use client";

import { Info, Check, Circle } from "lucide-react";
import type { EntityType } from "@/types/csv-import";
import { CLIENT_SCHEMA_FIELDS, PROJECT_SCHEMA_FIELDS } from "@/types/csv-import";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { StyledButton } from "@/components/ui/styled/styled-button";

function getSchemaFields(entityType: EntityType) {
	const schemaFields =
		entityType === "clients" ? CLIENT_SCHEMA_FIELDS : PROJECT_SCHEMA_FIELDS;

	const requiredFields = Object.entries(schemaFields)
		.filter(([, info]) => info.required)
		.map(([name, info]) => ({ name, ...info }));

	const optionalFields = Object.entries(schemaFields)
		.filter(([, info]) => !info.required)
		.map(([name, info]) => ({ name, ...info }));

	return { requiredFields, optionalFields };
}

function getTypeLabel(type: string) {
	switch (type) {
		case "enum":
			return "Select one";
		case "array":
			return "List (comma-separated)";
		case "id":
			return "Reference ID";
		case "number":
			return "Number";
		default:
			return "Text";
	}
}

/**
 * The scrollable reference content: required + optional columns and tips.
 * Shown inside the schema-guide drawer.
 */
function SchemaGuideContent({ entityType }: { entityType: EntityType }) {
	const { requiredFields, optionalFields } = getSchemaFields(entityType);

	return (
		<div className="space-y-4">
			{/* Required Fields */}
			<div>
				<h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
					<Check className="w-3.5 h-3.5 text-success" />
					Required Columns
				</h4>
				<div className="grid gap-2">
					{requiredFields.map((field) => (
						<div
							key={field.name}
							className="flex items-start gap-3 p-2 rounded-md bg-success/5 border border-success/20"
						>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<code className="text-xs font-mono bg-success/10 px-1.5 py-0.5 rounded text-success-foreground">
										{field.name}
									</code>
									<span className="text-xs text-muted-foreground">
										({getTypeLabel(field.type)})
									</span>
								</div>
								{"options" in field && field.options && (
									<div className="mt-1 text-xs text-muted-foreground">
										Options: {field.options.join(", ")}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Optional Fields */}
			<div>
				<h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
					<Circle className="w-3 h-3 text-muted-foreground" />
					Optional Columns
				</h4>
				<div className="grid gap-1.5">
					{optionalFields.map((field) => (
						<div
							key={field.name}
							className="flex items-start gap-3 p-2 rounded-md bg-muted/30 border border-border"
						>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
										{field.name}
									</code>
									<span className="text-xs text-muted-foreground">
										({getTypeLabel(field.type)})
									</span>
								</div>
								{"options" in field && field.options && (
									<div className="mt-1 text-xs text-muted-foreground">
										Options: {field.options.join(", ")}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Tips */}
			<Alert variant="info">
				<Info />
				<AlertTitle>Tips for your CSV file</AlertTitle>
				<AlertDescription>
					<ul className="space-y-1">
						<li>• Column headers should match the field names above (case-insensitive)</li>
						<li>• For list fields like tags, separate values with commas, semicolons, or pipes</li>
						<li>• Missing required fields will use sensible defaults when possible</li>
						<li>• Our AI will attempt to map similar column names automatically</li>
					</ul>
				</AlertDescription>
			</Alert>
		</div>
	);
}

interface CsvSchemaGuideDrawerProps {
	entityType: EntityType;
}

/**
 * A right-side drawer holding the CSV column reference. The trigger is a subtle
 * button meant to live in the import wizard header.
 */
export function CsvSchemaGuideDrawer({ entityType }: CsvSchemaGuideDrawerProps) {
	const { requiredFields, optionalFields } = getSchemaFields(entityType);
	const entityLabel = entityType === "clients" ? "Clients" : "Projects";

	return (
		<Drawer swipeDirection="right">
			<DrawerTrigger
				render={
					<StyledButton
						intent="plain"
						size="sm"
						showArrow={false}
						icon={<Info className="size-4" />}
						label="Column guide"
					/>
				}
			/>
			<DrawerContent className="sm:max-w-md!">
				<DrawerHeader className="border-b border-border">
					<DrawerTitle>CSV Column Guide for {entityLabel}</DrawerTitle>
					<DrawerDescription>
						{requiredFields.length} required, {optionalFields.length} optional
						column{optionalFields.length === 1 ? "" : "s"} you can include.
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex-1 overflow-y-auto p-4">
					<SchemaGuideContent entityType={entityType} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}

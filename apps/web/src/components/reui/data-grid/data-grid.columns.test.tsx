// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
	DataGrid,
	dataGridFeatures,
	type DataGridFeatures,
	useDataGrid,
} from "./data-grid";

type Row = { title: string };

function StableCompiledConsumer() {
	const { table } = useDataGrid<Row>();
	return <span>{table.options.columns.length} columns</span>;
}

function Harness({ columns }: { columns: ColumnDef<DataGridFeatures, Row>[] }) {
	const data = useMemo(() => [{ title: "Task" }], []);
	const table = useTable({ features: dataGridFeatures, data, columns });
	const compiledChild = useMemo(() => <StableCompiledConsumer />, []);
	return <DataGrid table={table} recordCount={1}>{compiledChild}</DataGrid>;
}

describe("DataGrid column updates", () => {
	it("publishes changed column definitions to compiler-stable consumers", () => {
		const { rerender } = render(<Harness columns={[{ accessorKey: "title" }]} />);
		expect(screen.getByText("1 columns")).toBeVisible();

		rerender(
			<Harness columns={[{ accessorKey: "title" }, { id: "actions" }]} />
		);

		expect(screen.getByText("2 columns")).toBeVisible();
	});
});

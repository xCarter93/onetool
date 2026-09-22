// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

import { SearchHelpRenderer } from "../search-help-renderer";

describe("SearchHelpRenderer", () => {
	it("shows a receipt line with the hit count for a search result", () => {
		render(
			<SearchHelpRenderer
				input={{ query: "import clients" }}
				output={{
					results: [
						{ ref: "clients/importing-clients", title: "Importing clients", url: "/help/clients/importing-clients", subtitle: "", category: "Clients", availability: "all" },
					],
				}}
			/>
		);

		expect(screen.getByText("Read 1 help article")).toBeInTheDocument();
	});

	it("shows a receipt line for a single fetched article", () => {
		render(
			<SearchHelpRenderer
				input={{ article: "clients/importing-clients" }}
				output={{
					ref: "clients/importing-clients",
					url: "/help/clients/importing-clients",
					title: "Importing clients",
					markdown: "# Importing clients",
				}}
			/>
		);

		expect(screen.getByText("Read 1 help article")).toBeInTheDocument();
	});

	it("renders nothing but the note text when there are no matches", () => {
		render(
			<SearchHelpRenderer
				input={{ query: "quantum teleportation" }}
				output={{ results: [], note: "No matching help articles." }}
			/>
		);

		expect(screen.queryByText(/^Read /)).not.toBeInTheDocument();
	});
});

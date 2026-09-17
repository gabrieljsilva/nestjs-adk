import { McpToolFilter } from "./mcp-tool-filter.service";

describe("McpToolFilter: which tools of a source may be used", () => {
	it("admits everything the server offers when neither list is given", () => {
		const filter = new McpToolFilter();

		expect(filter.admits("create_issue")).toBe(true);
	});

	it("admits only what the allow list names", () => {
		const filter = new McpToolFilter(["create_issue"]);

		expect(filter.admits("create_issue")).toBe(true);
		expect(filter.admits("delete_repo")).toBe(false);
	});

	it("keeps out what the deny list names", () => {
		const filter = new McpToolFilter(undefined, ["delete_repo"]);

		expect(filter.admits("create_issue")).toBe(true);
		expect(filter.admits("delete_repo")).toBe(false);
	});

	it("lets denial win when both lists name the same tool", () => {
		const filter = new McpToolFilter(["delete_repo"], ["delete_repo"]);

		// the two lists express opposite intents, and only "off is final" fails safe
		expect(filter.admits("delete_repo")).toBe(false);
	});

	it("keeps out a name no provider would accept as a function name", () => {
		const filter = new McpToolFilter();

		expect(filter.admits("create issue")).toBe(false);
		expect(filter.admits("create\nissue")).toBe(false);
		expect(filter.admits("")).toBe(false);
	});
});

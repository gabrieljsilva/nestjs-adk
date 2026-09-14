import { McpInvalidSourceNameError } from "./errors/mcp-invalid-source-name.error";
import { McpToolName } from "./mcp-tool-name";

describe("McpToolName: the name a tool is offered under", () => {
	it("qualifies a tool with the source it belongs to", () => {
		expect(McpToolName.forSource("github").qualify("create_issue")).toBe("mcp__github__create_issue");
	});

	it("gives two installations of one integration two distinct prefixes", () => {
		const first = McpToolName.forSource("github-7");
		const second = McpToolName.forSource("github-9");

		// the same server connected under two accounts: without this the model cannot say which it means
		expect(first.qualify("create_issue")).not.toBe(second.qualify("create_issue"));
	});

	it("answers the same name on every run", () => {
		const long = "a".repeat(60);

		expect(McpToolName.forSource("github").qualify(long)).toBe(McpToolName.forSource("github").qualify(long));
	});

	it("shortens a name past the 64 characters a provider accepts", () => {
		const qualified = McpToolName.forSource("a".repeat(40)).qualify("b".repeat(40));

		expect(qualified.length).toBe(64);
		expect(qualified).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it("keeps two long tools of one server apart after shortening", () => {
		const naming = McpToolName.forSource("a".repeat(40));

		// truncation alone would collapse both onto the same prefix and the model could reach either
		expect(naming.qualify(`${"b".repeat(40)}_one`)).not.toBe(naming.qualify(`${"b".repeat(40)}_two`));
	});

	it("refuses a source name that cannot become a function name", () => {
		expect(() => McpToolName.forSource("git hub")).toThrow(McpInvalidSourceNameError);
		expect(() => McpToolName.forSource("")).toThrow(McpInvalidSourceNameError);
	});

	it("refuses a source name long enough to leave no room for a tool", () => {
		expect(() => McpToolName.forSource("a".repeat(48))).toThrow(McpInvalidSourceNameError);
		expect(() => McpToolName.forSource("a".repeat(47))).not.toThrow();
	});

	it("reads a usable name by shape and length", () => {
		expect(McpToolName.isUsable("create_issue")).toBe(true);
		expect(McpToolName.isUsable("a".repeat(65))).toBe(false);
	});
});

import { describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";
import { McpControllerMetadata } from "./mcp-controller-metadata.value-object";

class LookupTool {}

describe("McpControllerMetadata", () => {
	it("reads the tools a controller lists", () => {
		expect(McpControllerMetadata.from({ tools: [LookupTool] }, "OrdersMcp").tools).toEqual([LookupTool]);
	});

	it("publishes nothing shared when the list is absent", () => {
		expect(McpControllerMetadata.from({}, "OrdersMcp").tools).toEqual([]);
	});

	it("refuses metadata that is not an object, naming the provider", () => {
		expect(() => McpControllerMetadata.from(undefined, "OrdersMcp")).toThrow(InvalidAgentMetadataError);
		expect(() => McpControllerMetadata.from(undefined, "OrdersMcp")).toThrow(/OrdersMcp/);
	});

	it("refuses a tools field that is not a list", () => {
		expect(() => McpControllerMetadata.from({ tools: LookupTool }, "OrdersMcp")).toThrow(/tools is not a list/);
	});
});

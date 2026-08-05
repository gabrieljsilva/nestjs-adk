import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { ToolMetadata } from "./tool-metadata";

const schema = z.object({ orderId: z.string() });

describe("ToolMetadata", () => {
	it("takes the name, description and schema a tool declared", () => {
		const metadata = ToolMetadata.from({ name: "lookup_order", description: "Finds an order.", schema }, "LookupTool");

		expect(metadata.name).toBe("lookup_order");
		expect(metadata.description).toBe("Finds an order.");
		expect(metadata.schema).toBe(schema);
	});

	it("falls back to the method name for a tool declared on an agent method", () => {
		const metadata = ToolMetadata.from({ description: "Refunds.", schema }, "SupportAgent", "refund");

		expect(metadata.name).toBe("refund");
	});

	it("assumes write when nobody said read, because that is the answer that costs an approval", () => {
		expect(ToolMetadata.from({ name: "t", description: "d", schema }, "P").effect.name).toBe("write");
	});

	it("takes the effect that was declared", () => {
		expect(ToolMetadata.from({ name: "t", description: "d", schema, effect: "read" }, "P").effect.name).toBe("read");
	});

	it("refuses an effect nobody can name", () => {
		expect(() => ToolMetadata.from({ name: "t", description: "d", schema, effect: "maybe" }, "P")).toThrow(
			InvalidAgentMetadataError,
		);
	});

	it("refuses a tool with no description or no schema", () => {
		expect(() => ToolMetadata.from({ name: "t", schema }, "P")).toThrow(/description/);
		expect(() => ToolMetadata.from({ name: "t", description: "d" }, "P")).toThrow(/zod schema/);
	});
});

import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AdkTool } from "./adk-tool";
import { Tool } from "./decorators/tool.decorator";
import { NotAToolClassError } from "./errors/not-a-tool-class.error";
import { ToolMetadata } from "./tool-metadata";

const schema = z.object({ orderId: z.string() });

@Tool({ name: "find_order", description: "Finds an order.", schema, effect: "read" })
class FindOrderTool extends AdkTool<typeof schema> {
	public execute(input: z.infer<typeof schema>): unknown {
		return input;
	}
}

class PlainService {}

describe("ToolMetadata", () => {
	it("reads the contract the decorator wrote", () => {
		const declaration = ToolMetadata.findOrFail(FindOrderTool);

		expect(declaration.name).toBe("find_order");
		expect(declaration.description).toBe("Finds an order.");
		expect(declaration.effect).toBe("read");
		expect(declaration.schema.safeParse({ orderId: "A-1" }).success).toBe(true);
	});

	it("finds nothing on a class that is not a tool", () => {
		expect(ToolMetadata.find(PlainService)).toBeUndefined();
	});

	it("fails naming the class when asked for a declaration it does not have", () => {
		expect(() => ToolMetadata.findOrFail(PlainService)).toThrow(NotAToolClassError);
		expect(() => ToolMetadata.findOrFail(PlainService)).toThrow(/PlainService/);
	});
});

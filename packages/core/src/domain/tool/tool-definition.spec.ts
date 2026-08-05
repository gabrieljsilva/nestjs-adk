import { describe, expect, it } from "vitest";
import { ParsedArguments } from "./parsed-arguments";
import { ToolDefinition } from "./tool-definition";
import { ToolEffect } from "./tool-effect";
import { ToolHandler } from "./tool-handler";
import { ToolSchema } from "./tool-schema";

class FixedSchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object", properties: { orderId: { type: "string" } } };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

function definitionOf(): ToolDefinition {
	return new ToolDefinition("refund", "Refunds an order", new FixedSchema(), ToolEffect.DESTRUCTIVE, new NoopHandler());
}

describe("ToolDefinition", () => {
	it("declares to the model only what the model needs", () => {
		const declaration = definitionOf().toDeclaration();

		expect(declaration.name).toBe("refund");
		expect(declaration.description).toBe("Refunds an order");
		expect(JSON.stringify(declaration)).not.toContain("destructive");
	});

	it("keeps the effect next to the handler, for a decision taken before it runs", () => {
		expect(definitionOf().effect).toBe(ToolEffect.DESTRUCTIVE);
	});
});

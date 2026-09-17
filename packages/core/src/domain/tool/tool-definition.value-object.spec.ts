import { describe, expect, it } from "vitest";
import { ToolEffect } from "./approval/tool-effect.value-object";
import { ParsedArguments } from "./invocation/parsed-arguments.value-object";
import { ToolHandler } from "./invocation/tool-handler.contract";
import { ToolDefinition } from "./tool-definition.value-object";
import { ToolSchema } from "./tool-schema.contract";

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

import { describe, expect, it } from "vitest";
import { ParsedArguments } from "./parsed-arguments";
import { ToolSchema } from "./tool-schema";

class AlwaysValidSchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(args: unknown): ParsedArguments {
		return ParsedArguments.valid({ received: args });
	}
}

describe("ToolSchema", () => {
	it("shows the model one thing and answers the runtime with another", () => {
		const schema = new AlwaysValidSchema();

		expect(schema.declaration()).toEqual({ type: "object" });
		expect(schema.parse("x").isValid).toBe(true);
	});

	it("is the type the runtime depends on", () => {
		expect(new AlwaysValidSchema()).toBeInstanceOf(ToolSchema);
	});
});

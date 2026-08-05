import { describe, expect, it } from "vitest";
import { ToolNotFoundError } from "../../domain/tool/errors/tool-not-found.error";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { ToolCatalog } from "./tool-catalog";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
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

function toolOf(name: string): ToolDefinition {
	return new ToolDefinition(name, `the ${name} tool`, new AnySchema(), ToolEffect.READ, new NoopHandler());
}

describe("ToolCatalog", () => {
	it("finds the tool the model named", () => {
		const catalog = ToolCatalog.of([toolOf("refund"), toolOf("lookup")]);

		expect(catalog.findOrFail("lookup").name).toBe("lookup");
		expect(catalog.has("refund")).toBe(true);
	});

	it("refuses a name it does not know, and says what it does know", () => {
		const error = (() => {
			try {
				ToolCatalog.of([toolOf("refund")]).findOrFail("refunds");
			} catch (reason) {
				return reason;
			}
		})();

		expect(error).toBeInstanceOf(ToolNotFoundError);
	});

	it("declares to the model in the order the agent wrote", () => {
		const catalog = ToolCatalog.of([toolOf("refund"), toolOf("lookup")]);

		expect(catalog.declarations().map((declaration) => declaration.name)).toEqual(["refund", "lookup"]);
	});

	it("offers nothing when the agent declared nothing", () => {
		expect(ToolCatalog.empty().isEmpty).toBe(true);
		expect(ToolCatalog.empty().declarations()).toHaveLength(0);
	});

	it("cannot be changed after it is built", () => {
		const catalog = ToolCatalog.of([toolOf("refund")]);

		expect(Object.isFrozen(catalog)).toBe(true);
		expect(catalog.size).toBe(1);
	});
});

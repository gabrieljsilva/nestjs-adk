import { describe, expect, it } from "vitest";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { UnregisteredToolError } from "./errors/unregistered-tool.error";
import { SharedToolLookup } from "./shared-tool-lookup.service";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

class LookupTool {}

class SearchArtifact {
	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest("search_artifact", "Searches.", new AnySchema(), ToolEffect.READ);
	}
}

class PretendsToBeOne {
	public static request(): ToolDefinition {
		return new ToolDefinition("pretend", "Pretends.", new AnySchema(), ToolEffect.READ, new SilentHandler());
	}
}

const lookup = new ToolDefinition("lookup_order", "Finds.", new AnySchema(), ToolEffect.READ, new SilentHandler());
const shared = new SharedToolLookup(new Map<unknown, ToolDefinition>([[LookupTool, lookup]]));

describe("SharedToolLookup", () => {
	it("answers the class the tool was registered under", () => {
		expect(shared.resolve(LookupTool, "SupportAgent")).toBe(lookup);
	});

	it("answers the name the tool declared with the very same definition, so nothing is built twice", () => {
		expect(shared.resolve("lookup_order", "SupportAgent")).toBe(lookup);
	});

	it("refuses a name nobody declared, printing it beside the names it did find", () => {
		expect(() => shared.resolve("refund_order", "SupportAgent")).toThrow(UnregisteredToolError);
		expect(() => shared.resolve("refund_order", "SupportAgent")).toThrow(/refund_order/);
		expect(() => shared.resolve("refund_order", "SupportAgent")).toThrow(/lookup_order/);
	});

	it("refuses a class nobody registered, by its own name", () => {
		class Orphan {}

		expect(() => shared.resolve(Orphan, "SupportAgent")).toThrow(/Orphan/);
	});

	it("resolves a whole list in the order it was written", () => {
		expect(shared.resolveAll(["lookup_order", LookupTool], "SupportAgent")).toEqual([lookup, lookup]);
	});

	it("answers a runtime tool class the application listed, without it being registered anywhere", () => {
		const asked = shared.resolve(SearchArtifact, "SupportAgent");

		expect(asked).toBeInstanceOf(RuntimeToolRequest);
		expect(asked.name).toBe("search_artifact");
	});

	it("refuses a class whose request is not a runtime tool, so the check is the type and not the method name", () => {
		expect(() => shared.resolve(PretendsToBeOne, "SupportAgent")).toThrow(UnregisteredToolError);
	});
});

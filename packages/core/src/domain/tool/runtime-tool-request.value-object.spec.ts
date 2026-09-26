import { describe, expect, it } from "vitest";
import { ToolEffect } from "./approval/tool-effect.value-object";
import { UnboundRuntimeToolError } from "./errors/unbound-runtime-tool.error";
import { ParsedArguments } from "./invocation/parsed-arguments.value-object";
import { ToolHandler } from "./invocation/tool-handler.contract";
import { RuntimeToolRequest } from "./runtime-tool-request.value-object";
import { ToolSchema } from "./tool-schema.contract";

class OneField extends ToolSchema {
	public declaration(): unknown {
		return { type: "object", properties: { at: { type: "integer" } } };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({ at: 1 });
	}
}

class Answering extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return "answered";
	}
}

function request(): RuntimeToolRequest {
	return new RuntimeToolRequest("read_artifact", "Reads an artifact.", new OneField(), ToolEffect.READ);
}

describe("RuntimeToolRequest", () => {
	it("declares everything the model reads, so a request and the bound tool say the same thing", () => {
		const declaration = request().toDeclaration();

		expect(declaration.name).toBe("read_artifact");
		expect(declaration.description).toBe("Reads an artifact.");
		expect(declaration.parameters).toEqual({ type: "object", properties: { at: { type: "integer" } } });
	});

	it("declares the effect it was built with, because every policy now reads it like any other tool", () => {
		expect(request().effect).toBe(ToolEffect.READ);
	});

	it("keeps the declaration and takes the code when the runtime binds it", async () => {
		const bound = request().boundTo(new Answering());

		expect(bound.name).toBe("read_artifact");
		expect(bound.description).toBe("Reads an artifact.");
		expect(bound.effect).toBe(ToolEffect.READ);
		await expect(bound.handler.invoke({}, {} as never)).resolves.toBe("answered");
	});

	it("is no longer a request once it is bound, so binding it twice cannot happen by accident", () => {
		expect(request().boundTo(new Answering())).not.toBeInstanceOf(RuntimeToolRequest);
	});

	it("refuses rather than answering when it reaches a model no runtime bound it for", async () => {
		await expect(request().handler.invoke({}, {} as never)).rejects.toThrow(UnboundRuntimeToolError);
	});
});

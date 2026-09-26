import { describe, expect, it } from "vitest";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { RuntimeTools } from "./runtime-tools.value-object";

class Nothing extends ToolSchema {
	public declaration(): unknown {
		return { type: "object", properties: {} };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class Answering extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

function bound(name: string): ToolDefinition {
	return new ToolDefinition(name, `the ${name} tool`, new Nothing(), ToolEffect.READ, new Answering());
}

function asked(name: string): RuntimeToolRequest {
	return new RuntimeToolRequest(name, `the ${name} tool`, new Nothing(), ToolEffect.READ);
}

const runtime = new RuntimeTools([bound("read_artifact")], [bound("search_artifact"), bound("slice_artifact")]);

describe("RuntimeTools", () => {
	it("brings what every agent gets, whether or not the agent asked for anything", () => {
		expect(runtime.bind([bound("lookup_order")]).map((tool) => tool.name)).toEqual(["read_artifact"]);
	});

	it("binds only the tools the agent asked for by listing them", () => {
		const declared = [bound("lookup_order"), asked("search_artifact")];

		expect(runtime.bind(declared).map((tool) => tool.name)).toEqual(["read_artifact", "search_artifact"]);
	});

	it("binds every tool an agent asked for", () => {
		const declared = [asked("search_artifact"), asked("slice_artifact")];

		expect(runtime.bind(declared).map((tool) => tool.name)).toEqual([
			"read_artifact",
			"search_artifact",
			"slice_artifact",
		]);
	});

	it("answers with the tool that runs, never with the request the agent listed", () => {
		const bindings = runtime.bind([asked("search_artifact")]);

		expect(bindings.some((tool) => tool instanceof RuntimeToolRequest)).toBe(false);
	});

	it("leaves an application tool alone even where it shares a name with one the runtime owns", () => {
		const own = bound("search_artifact");

		expect(runtime.bind([own]).map((tool) => tool.name)).toEqual(["read_artifact"]);
	});

	it("brings nothing when the runtime owns nothing, which is how a test composes it", () => {
		expect(RuntimeTools.none().bind([asked("search_artifact")])).toEqual([]);
	});
});

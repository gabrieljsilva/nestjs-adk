import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ParsedArguments } from "../invocation/parsed-arguments.value-object";
import { ToolHandler } from "../invocation/tool-handler.contract";
import { ToolInvocation } from "../invocation/tool-invocation.value-object";
import { ToolDefinition } from "../tool-definition.value-object";
import { ToolSchema } from "../tool-schema.contract";
import { EffectApprovalPolicy } from "./effect-approval.policy";
import { ToolEffect } from "./tool-effect.value-object";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return {};
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

function toolOf(effect: ToolEffect): ToolDefinition {
	return new ToolDefinition("t", "a tool", new AnySchema(), effect, new NoopHandler());
}

const invocation = new ToolInvocation(ToolCallId.from("c-1"), "t", {});

describe("EffectApprovalPolicy", () => {
	it("stops nothing when no threshold was declared", () => {
		const policy = EffectApprovalPolicy.never();

		expect(policy.requires(toolOf(ToolEffect.DESTRUCTIVE), invocation)).toBe(false);
	});

	it("stops from the threshold upwards", () => {
		const policy = EffectApprovalPolicy.from(ToolEffect.WRITE);

		expect(policy.requires(toolOf(ToolEffect.READ), invocation)).toBe(false);
		expect(policy.requires(toolOf(ToolEffect.WRITE), invocation)).toBe(true);
		expect(policy.requires(toolOf(ToolEffect.DESTRUCTIVE), invocation)).toBe(true);
	});

	it("stops only what destroys, when that is the threshold", () => {
		const policy = EffectApprovalPolicy.destructiveOnly();

		expect(policy.requires(toolOf(ToolEffect.WRITE), invocation)).toBe(false);
		expect(policy.requires(toolOf(ToolEffect.DESTRUCTIVE), invocation)).toBe(true);
	});
});

import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolCall } from "../../../domain/model/messages/tool-call.value-object";
import { EffectApprovalPolicy } from "../../../domain/tool/approval/effect-approval.policy";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { ToolCatalog } from "../../tool/tool-catalog.service";
import { ApprovalGate } from "./approval-gate.service";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(args: unknown): ParsedArguments {
		return ParsedArguments.valid(typeof args === "object" && args !== null ? { ...args } : {});
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

function toolOf(name: string, effect: ToolEffect): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), effect, new SilentHandler());
}

const catalog = new ToolCatalog([
	toolOf("lookup_order", ToolEffect.READ),
	toolOf("refund_order", ToolEffect.WRITE),
	toolOf("read_artifact", ToolEffect.READ),
]);

function callTo(name: string, id: string): ToolCall {
	return new ToolCall(ToolCallId.from(id), name, { orderId: "42" });
}

const holdsWrites = new ApprovalGate(EffectApprovalPolicy.from(ToolEffect.WRITE));

describe("ApprovalGate", () => {
	it("describes the whole turn, not only the calls it holds", () => {
		const turn = holdsWrites.screen(catalog, [callTo("lookup_order", "c-1"), callTo("refund_order", "c-2")]);

		expect(turn).toHaveLength(2);
		expect(turn.map((call) => call.isHeld)).toEqual([false, true]);
	});

	it("puts the effect that held a call on the call, which is what a person reads", () => {
		const turn = holdsWrites.screen(catalog, [callTo("refund_order", "c-1")]);

		expect(turn[0]?.effect).toBe(ToolEffect.WRITE.name);
	});

	it("keeps the arguments, so the call that runs later is the call that was shown", () => {
		expect(holdsWrites.screen(catalog, [callTo("refund_order", "c-1")])[0]?.args).toEqual({ orderId: "42" });
	});

	it("holds nothing at all under the default policy, since a declared tool was meant to be offered", () => {
		const turn = new ApprovalGate().screen(catalog, [callTo("refund_order", "c-1")]);

		expect(turn[0]?.isHeld).toBe(false);
	});

	it("holds a tool the runtime brought itself, because the policy reads its effect like any other", () => {
		const always = new ApprovalGate(EffectApprovalPolicy.from(ToolEffect.READ));

		expect(always.screen(catalog, [callTo("read_artifact", "c-1")])[0]?.isHeld).toBe(true);
	});

	it("never holds a call to something the catalog does not have, since there is no effect to hold", () => {
		expect(holdsWrites.screen(catalog, [callTo("invented_tool", "c-1")])[0]?.isHeld).toBe(false);
	});

	it("says whether the turn has anything to answer for at all", () => {
		expect(holdsWrites.holdsAny(holdsWrites.screen(catalog, [callTo("lookup_order", "c-1")]))).toBe(false);
		expect(holdsWrites.holdsAny(holdsWrites.screen(catalog, [callTo("refund_order", "c-1")]))).toBe(true);
		expect(holdsWrites.holdsAny([])).toBe(false);
	});
});

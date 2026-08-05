import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AdkApprovalPolicy } from "./adk-approval-policy";
import { ParsedArguments } from "./parsed-arguments";
import { ToolDefinition } from "./tool-definition";
import { ToolEffect } from "./tool-effect";
import { ToolHandler } from "./tool-handler";
import { ToolInvocation } from "./tool-invocation";
import { ToolSchema } from "./tool-schema";

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

/** Decides on the arguments rather than on the tool, which is the case the invocation is there for. */
class LargeRefundApproval extends AdkApprovalPolicy {
	public requires(_tool: ToolDefinition, invocation: ToolInvocation): boolean {
		const amount =
			typeof invocation.args === "object" && invocation.args !== null ? Reflect.get(invocation.args, "amount") : undefined;
		return typeof amount === "number" && amount > 100;
	}
}

const refund = new ToolDefinition("refund", "Refunds", new AnySchema(), ToolEffect.WRITE, new NoopHandler());

describe("AdkApprovalPolicy", () => {
	it("can decide on the arguments of the call, not only on the tool", () => {
		const policy = new LargeRefundApproval();

		expect(policy.requires(refund, new ToolInvocation(ToolCallId.from("c-1"), "refund", { amount: 1000 }))).toBe(true);
		expect(policy.requires(refund, new ToolInvocation(ToolCallId.from("c-2"), "refund", { amount: 1 }))).toBe(false);
	});

	it("is the type the runtime depends on", () => {
		expect(new LargeRefundApproval()).toBeInstanceOf(AdkApprovalPolicy);
	});
});

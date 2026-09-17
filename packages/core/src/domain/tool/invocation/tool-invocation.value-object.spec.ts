import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolCall } from "../../model/messages/tool-call.value-object";
import { ToolInvocation } from "./tool-invocation.value-object";

describe("ToolInvocation", () => {
	it("carries the call id that will tie the result back to it", () => {
		const invocation = new ToolInvocation(ToolCallId.from("c-1"), "refund", { orderId: "42" });

		expect(invocation.callId.value).toBe("c-1");
		expect(invocation.toolName).toBe("refund");
	});

	it("is built from what the model asked for, without validating it", () => {
		const call = new ToolCall(ToolCallId.from("c-1"), "refund", { orderId: 42 });

		expect(ToolInvocation.from(call).args).toEqual({ orderId: 42 });
	});
});

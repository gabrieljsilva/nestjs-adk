import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ToolCall } from "./tool-call";

describe("ToolCall", () => {
	it("carries the id that pairs it with its result", () => {
		expect(new ToolCall(ToolCallId.from("call-1"), "refund", {}).callId.value).toBe("call-1");
	});

	it("carries the tool and the arguments the model chose", () => {
		const call = new ToolCall(ToolCallId.from("call-1"), "refund", { orderId: "42" });

		expect(call.toolName).toBe("refund");
		expect(call.args).toEqual({ orderId: "42" });
	});
});

import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { PendingCall } from "../../session/approval/pending-call.value-object";
import { ToolEffect } from "../approval/tool-effect.value-object";
import { ParsedArguments } from "../invocation/parsed-arguments.value-object";
import { ToolHandler } from "../invocation/tool-handler.contract";
import { ToolDefinition } from "../tool-definition.value-object";
import { ToolSchema } from "../tool-schema.contract";
import { ToolCallNotice } from "./tool-call.notice";

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
		return {};
	}
}

const CALL = ToolCallId.from("c-1");
const refund = new ToolDefinition("refund_order", "Refunds.", new AnySchema(), ToolEffect.WRITE, new NoopHandler());
const readArtifact = new ToolDefinition(
	"read_artifact",
	"Reads.",
	new AnySchema(),
	ToolEffect.READ,
	new NoopHandler(),
	true,
);

describe("ToolCallNotice", () => {
	it("carries the call as the gate screened it, with the tool beside it", () => {
		const notice = ToolCallNotice.fromCall(new PendingCall(CALL, "refund_order", { orderId: "42" }, "write"), refund);

		expect(notice.callId).toBe(CALL);
		expect(notice.toolName).toBe("refund_order");
		expect(notice.args).toEqual({ orderId: "42" });
		expect(notice.isHeld).toBe(true);
		expect(notice.effect).toBe(ToolEffect.WRITE);
		expect(notice.isKnown).toBe(true);
		expect(notice.isInternal).toBe(false);
	});

	it("reads a call nobody held as not held", () => {
		const notice = ToolCallNotice.fromCall(new PendingCall(CALL, "refund_order", {}), refund);

		expect(notice.isHeld).toBe(false);
	});

	it("says so for a tool the catalog does not know, instead of inventing an effect", () => {
		const notice = ToolCallNotice.fromCall(new PendingCall(CALL, "made_up", {}));

		expect(notice.isKnown).toBe(false);
		expect(notice.effect).toBeUndefined();
		expect(notice.tool).toBeUndefined();
		expect(notice.isInternal).toBe(false);
	});

	it("marks a tool the runtime owns", () => {
		expect(ToolCallNotice.fromCall(new PendingCall(CALL, "read_artifact", {}), readArtifact).isInternal).toBe(true);
	});

	it("hands out a copy of the arguments, so an observer cannot change what will run", () => {
		const args: Record<string, unknown> = { orderId: "42" };
		const notice = ToolCallNotice.fromCall(new PendingCall(CALL, "refund_order", args), refund);

		expect(notice.args).not.toBe(args);
		expect(notice.args).toEqual(args);
	});
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../adapters/schema/zod-tool-schema.adapter";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { Actor } from "../../domain/tool/access/actor.value-object";
import { AdkAccessPolicy } from "../../domain/tool/access/adk-access.policy";
import { ToolAccess } from "../../domain/tool/access/tool-access.value-object";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolGate } from "./tool-gate.service";

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

class OwnersOnly extends AdkAccessPolicy {
	public readonly asked: Array<{ tool: string; actor?: string; args: unknown }> = [];

	public decide(tool: ToolDefinition, invocation: ToolInvocation, actor: Actor | undefined): ToolAccess {
		this.asked.push({ tool: tool.name, actor: actor?.id, args: invocation.args });
		return actor?.claims.role === "owner" ? ToolAccess.granted() : ToolAccess.denied("owners only");
	}
}

const schema = ZodToolSchema.fromSchema(z.object({ orderId: z.string() }));

function refund(): ToolDefinition {
	return new ToolDefinition("refund", "Refunds.", schema, ToolEffect.DESTRUCTIVE, new NoopHandler());
}

function call(args: unknown): ToolInvocation {
	return new ToolInvocation(ToolCallId.from("c-1"), "refund", args);
}

describe("ToolGate", () => {
	it("admits a well formed call the policy grants, with the parsed values", async () => {
		const admission = await new ToolGate(new OwnersOnly()).admit(
			refund(),
			call({ orderId: "A-1", extra: "dropped" }),
			Actor.fromId("u-1", { role: "owner" }),
		);

		expect(admission.isAdmitted).toBe(true);
		expect(admission.values).toEqual({ orderId: "A-1" });
	});

	it("refuses arguments the schema rejects before asking the policy", async () => {
		const policy = new OwnersOnly();
		const admission = await new ToolGate(policy).admit(
			refund(),
			call({ orderId: 7 }),
			Actor.fromId("u-1", { role: "owner" }),
		);

		expect(admission.isAdmitted).toBe(false);
		expect(admission.wasDenied).toBe(false);
		expect(admission.reason).toContain("orderId");
		expect(policy.asked).toHaveLength(0);
	});

	it("denies with the policy's reason and names the actor it asked about", async () => {
		const policy = new OwnersOnly();
		const admission = await new ToolGate(policy).admit(
			refund(),
			call({ orderId: "A-1" }),
			Actor.fromId("u-2", { role: "member" }),
		);

		expect(admission.isAdmitted).toBe(false);
		expect(admission.wasDenied).toBe(true);
		expect(admission.reason).toBe("owners only");
		expect(policy.asked).toEqual([{ tool: "refund", actor: "u-2", args: { orderId: "A-1" } }]);
	});

	it("asks the policy about a call with no actor, which is the policy's to refuse", async () => {
		const admission = await new ToolGate(new OwnersOnly()).admit(refund(), call({ orderId: "A-1" }), undefined);

		expect(admission.wasDenied).toBe(true);
	});

	it("admits everything when no policy was declared", async () => {
		const admission = await new ToolGate().admit(refund(), call({ orderId: "A-1" }), undefined);

		expect(admission.isAdmitted).toBe(true);
	});

	it("asks the policy about every tool, including the ones the runtime brought itself", async () => {
		const policy = new OwnersOnly();
		const admission = await new ToolGate(policy).admit(refund(), call({ orderId: "A-1" }), undefined);

		expect(admission.isAdmitted).toBe(false);
		expect(policy.asked).toHaveLength(1);
	});
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../../adapters/schema/zod-tool-schema.adapter";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolEffect } from "../approval/tool-effect.value-object";
import { ToolHandler } from "../invocation/tool-handler.contract";
import { ToolInvocation } from "../invocation/tool-invocation.value-object";
import { ToolDefinition } from "../tool-definition.value-object";
import { Actor } from "./actor.value-object";
import { OpenAccessPolicy } from "./open-access.policy";

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

const tool = new ToolDefinition(
	"refund",
	"Refunds.",
	ZodToolSchema.fromSchema(z.object({})),
	ToolEffect.DESTRUCTIVE,
	new NoopHandler(),
);
const invocation = new ToolInvocation(ToolCallId.from("c-1"), "refund", {});

describe("OpenAccessPolicy", () => {
	it("grants a call with an actor", () => {
		expect(new OpenAccessPolicy().decide(tool, invocation, Actor.fromId("u-1")).isGranted).toBe(true);
	});

	it("grants a call without one", () => {
		expect(new OpenAccessPolicy().decide(tool, invocation, undefined).isGranted).toBe(true);
	});
});

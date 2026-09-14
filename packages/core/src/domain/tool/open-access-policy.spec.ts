import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../adapters/schema/zod-tool-schema";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { Actor } from "./actor";
import { OpenAccessPolicy } from "./open-access-policy";
import { ToolDefinition } from "./tool-definition";
import { ToolEffect } from "./tool-effect";
import { ToolHandler } from "./tool-handler";
import { ToolInvocation } from "./tool-invocation";

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return undefined;
	}
}

const tool = new ToolDefinition(
	"refund",
	"Refunds.",
	ZodToolSchema.of(z.object({})),
	ToolEffect.DESTRUCTIVE,
	new NoopHandler(),
);
const invocation = new ToolInvocation(ToolCallId.from("c-1"), "refund", {});

describe("OpenAccessPolicy", () => {
	it("grants a call with an actor", () => {
		expect(new OpenAccessPolicy().decide(tool, invocation, Actor.of("u-1")).isGranted).toBe(true);
	});

	it("grants a call without one", () => {
		expect(new OpenAccessPolicy().decide(tool, invocation, undefined).isGranted).toBe(true);
	});
});

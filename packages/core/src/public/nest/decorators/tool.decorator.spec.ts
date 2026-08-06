import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { INLINE_TOOLS_METADATA, TOOL_METADATA } from "../../../adapters/nest/metadata-keys";
import type { ToolContext } from "../../../domain/tool/tool-context";
import { AdkTool } from "../adk-tool";
import { Tool } from "./tool.decorator";

const schema = z.object({ orderId: z.string() });

@Tool({ name: "lookup_order", description: "Looks up an order.", schema, effect: "read" })
class LookupOrderTool extends AdkTool<typeof schema> {
	public execute(input: z.infer<typeof schema>): unknown {
		return input.orderId;
	}
}

class SupportAgent {
	@Tool({ description: "Refunds an order.", schema })
	public refund(input: z.infer<typeof schema>): unknown {
		return { refunded: input.orderId };
	}

	@Tool({ name: "open_ticket", description: "Opens a ticket.", schema })
	public ticket(input: z.infer<typeof schema>, context: ToolContext): unknown {
		return { orderId: input.orderId, session: context.sessionId.value };
	}
}

/** A sector that adds its own tool without inheriting the one the base declared. */
class BillingAgent extends SupportAgent {
	@Tool({ description: "Charges an order.", schema })
	public charge(input: z.infer<typeof schema>): unknown {
		return { charged: input.orderId };
	}
}

function inlineToolsOf(target: object): unknown[] {
	return Reflect.getOwnMetadata(INLINE_TOOLS_METADATA, target) ?? [];
}

describe("Tool", () => {
	it("keeps what a shared tool declared where the scanner reads it", () => {
		expect(Reflect.getMetadata(TOOL_METADATA, LookupOrderTool)).toEqual({
			name: "lookup_order",
			description: "Looks up an order.",
			schema,
			effect: "read",
		});
	});

	it("makes the class a provider, so it is built with its dependencies", () => {
		expect(Reflect.getMetadata("__injectable__", LookupOrderTool)).toBe(true);
	});

	it("names a tool declared on an agent after the method, and keeps a name that was given", () => {
		expect(inlineToolsOf(SupportAgent)).toEqual([
			{ method: "refund", options: { name: "refund", description: "Refunds an order.", schema } },
			{ method: "ticket", options: { name: "open_ticket", description: "Opens a ticket.", schema } },
		]);
	});

	/**
	 * Own metadata, not inherited metadata.
	 *
	 * A subclass that declared one tool must not answer with its parent's list as well, or
	 * the scanner would bind the same method twice under two agents and the model would see
	 * a tool the second agent never declared.
	 */
	it("gives a subclass only the tools the subclass itself declared", () => {
		expect(inlineToolsOf(BillingAgent)).toEqual([
			{ method: "charge", options: { name: "charge", description: "Charges an order.", schema } },
		]);
	});

	it("writes nothing about a shared tool onto a class that declared none", () => {
		expect(Reflect.getMetadata(TOOL_METADATA, SupportAgent)).toBeUndefined();
	});
});

import { AdkAgent, AdkTool, Agent, Skill, Tool, type ToolContext } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { OrdersService } from "./orders.service";

const lookupSchema = z.object({ orderId: z.string().describe("Order number.") });

/** Shared tool (class) — normal DI. */
@Tool({ name: "lookup_order", description: "Looks up the status of an order.", schema: lookupSchema })
@Injectable()
export class LookupOrderTool extends AdkTool<typeof lookupSchema> {
	constructor(private readonly orders: OrdersService) {
		super();
	}

	execute(input: z.infer<typeof lookupSchema>) {
		return this.orders.find(input.orderId) ?? { error: `Order ${input.orderId} not found.` };
	}
}

const refundSchema = z.object({ orderId: z.string(), amount: z.number() });

@Agent({
	name: "support_agent",
	description: "Handles orders for the store.",
	prompt: "You are the store's support agent. Help with orders, refunds, and policies.",
	tools: [LookupOrderTool],
})
export class SupportAgent extends AdkAgent {
	constructor(private readonly orders: OrdersService) {
		super();
	}

	/** Always-present skill (tone of voice). */
	@Skill({ name: "tone", description: "Brand tone of voice.", mode: "always" })
	tone() {
		return "Answer in English, in a friendly and direct tone.";
	}

	/** On-demand skill — loaded via load_skill when the topic comes up. */
	@Skill({ name: "refund_policy", description: "The store's refund policy." })
	refundPolicy() {
		return "Refunds: up to 7 days after delivery. Above $1,000 require manual approval from the team.";
	}

	/** Inline tool with HITL: a large refund pauses the run until human approval. */
	@Tool({
		description: "Executes the refund for an order.",
		schema: refundSchema,
		requiresApproval: (input) => (input as z.infer<typeof refundSchema>).amount > 1_000,
	})
	refund(input: z.infer<typeof refundSchema>, _ctx?: ToolContext) {
		return this.orders.refund(input.orderId);
	}
}

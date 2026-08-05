import { Agent, Skill, Tool, type ToolContext } from "@nestjs-adk/core";
import { z } from "zod";
import { OrdersService } from "./orders.service";

const lookupSchema = z.object({ orderId: z.string().describe("Order number.") });
const refundSchema = z.object({ orderId: z.string(), amount: z.number() });

/** A shared tool: its own provider, with its own dependencies. */
@Tool({ name: "lookup_order", description: "Looks up the status of an order.", schema: lookupSchema, effect: "read" })
export class LookupOrderTool {
	public constructor(private readonly orders: OrdersService) {}

	public execute(input: { orderId: string }): unknown {
		return this.orders.find(input.orderId) ?? { error: `Order ${input.orderId} not found.` };
	}
}

@Agent({
	name: "support",
	description: "Handles orders for the store.",
	prompt: "You are the store's support agent. Help with orders, refunds and policies.",
	tools: [LookupOrderTool],
})
export class SupportAgent {
	public constructor(private readonly orders: OrdersService) {}

	/** Always present: tone of voice is not something to look up. */
	@Skill({ name: "tone", description: "Brand tone of voice.", mode: "always" })
	public tone(): string {
		return "Answer in English, in a friendly and direct tone.";
	}

	/** Loaded only when the topic comes up, so it costs nothing the rest of the time. */
	@Skill({ name: "refund_policy", description: "The store's refund policy." })
	public refundPolicy(): string {
		return "Refunds: up to 7 days after delivery. Above $1,000 require manual approval.";
	}

	/** Money leaving is not recoverable, so it is declared destructive and a policy can hold it. */
	@Tool({ description: "Executes the refund for an order.", schema: refundSchema, effect: "destructive" })
	public refund(input: { orderId: string; amount: number }, _context?: ToolContext): unknown {
		return this.orders.refund(input.orderId);
	}
}

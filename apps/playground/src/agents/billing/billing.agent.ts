import { AdkAgent, Agent, Clock, Tool, TransfersTo } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../../aftersales/errors/order-not-found.error";
import { FindOrderUseCase } from "../../aftersales/find-order.use-case";
import { RefundLimitUseCase } from "../../aftersales/refund-limit.use-case";
import { IssueRefundTool } from "../../aftersales/tools/issue-refund.tool";
import { WarrantyAgent } from "../warranty/warranty.agent";

const CENTS_PER_REAL = 100;

const findOrderSchema = z.object({ orderId: z.string().describe("Order number, for example A-1042.") });
const refundLimitSchema = z.object({ plan: z.string().describe("Customer plan: gold, silver, or bronze.") });

/**
 * The sector money leaves from.
 *
 * Reading an order and reading a plan limit are methods here, because nothing outside a
 * conversation asks them that way. Refunding is a class, because the site refunds through
 * the same tool, and because a destructive tool is easier to find when it has its own file.
 */
@Agent({
	name: "billing",
	description: "Billing department: orders, refund limits by plan, and refunds.",
	prompt: `You are the billing department at Nébula Games.
Use find_order to inspect an order and refund_limit to learn the customer plan limit.
To return money, use issue_refund: it requires human approval, so tell the customer the refund request was submitted for approval.
When the subject returns to defects, warranties, or tickets, transfer the conversation back to "warranty".
Answer in English using at most two sentences, always stating the amount in Brazilian reais.`,
	tools: [IssueRefundTool],
})
@TransfersTo(() => WarrantyAgent)
export class BillingAgent extends AdkAgent {
	public constructor(
		private readonly findOrderUseCase: FindOrderUseCase,
		private readonly refundLimitUseCase: RefundLimitUseCase,
		private readonly clock: Clock,
	) {
		super();
	}

	@Tool({
		name: "find_order",
		description: "Shows an order: product, amount paid, customer plan, and status.",
		schema: findOrderSchema,
		effect: "read",
	})
	public findOrder(input: z.infer<typeof findOrderSchema>): unknown {
		try {
			const order = this.findOrderUseCase.execute(input.orderId);
			return {
				orderId: order.id,
				customer: order.customer,
				product: order.product,
				totalBrl: order.totalBrl,
				plan: order.plan,
				status: order.status,
				daysSinceDelivery: order.daysSinceDelivery(this.clock.now()),
			};
		} catch (error) {
			if (error instanceof OrderNotFoundError) return { error: error.message };
			throw error;
		}
	}

	@Tool({
		name: "refund_limit",
		description: "How much a plan can receive back without manager approval, in Brazilian reais.",
		schema: refundLimitSchema,
		effect: "read",
	})
	public refundLimit(input: z.infer<typeof refundLimitSchema>): unknown {
		return { plan: input.plan, limitBrl: this.refundLimitUseCase.execute(input.plan) / CENTS_PER_REAL };
	}
}

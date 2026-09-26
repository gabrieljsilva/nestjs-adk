import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../errors/order-not-found.error";
import { RefundRefusedError } from "../errors/refund-refused.error";
import { IssueRefundUseCase } from "../issue-refund.use-case";

const CENTS_PER_REAL = 100;

const schema = z.object({
	orderId: z.string().describe("Order number, for example A-1042."),
	amountBrl: z.number().positive().describe("How much to give back, in reais."),
});

@Tool({
	name: "issue_refund",
	description: "Refunds an order. Money leaves the store, so it waits for a human decision.",
	schema,
	effect: "destructive",
})
export class IssueRefundTool extends AdkTool<typeof schema> {
	public constructor(private readonly issueRefundUseCase: IssueRefundUseCase) {
		super();
	}

	public execute(input: z.infer<typeof schema>): unknown {
		const cents = Math.round(input.amountBrl * CENTS_PER_REAL);
		try {
			const order = this.issueRefundUseCase.execute(input.orderId, cents);
			return { refunded: true, orderId: order.id, amountBrl: order.refundedCents / CENTS_PER_REAL };
		} catch (error) {
			if (error instanceof RefundRefusedError || error instanceof OrderNotFoundError) {
				return { refunded: false, error: error.message };
			}
			throw error;
		}
	}
}

import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../aftersales/errors/order-not-found.error";
import { RefundRefusedError } from "../aftersales/errors/refund-refused.error";
import { IssueRefundUseCase } from "../aftersales/issue-refund.use-case";

const CENTS_PER_REAL = 100;

const schema = z.object({
	orderId: z.string().describe("Order number, for example A-1042."),
	amountBrl: z.number().positive().describe("How much to give back, in reais."),
});

/**
 * The tool that gives money back.
 *
 * It is declared destructive, which is what makes the approval policy hold the run in
 * front of a human before it ever runs. Reais in, centavos inside: the conversation speaks
 * in reais and the store keeps money in centavos, and this is the boundary between them.
 */
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

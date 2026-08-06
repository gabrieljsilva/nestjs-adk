import { AdkAgent, Agent, Clock, Tool } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../aftersales/errors/order-not-found.error";
import { FindOrderUseCase } from "../aftersales/find-order.use-case";
import { RefundLimitUseCase } from "../aftersales/refund-limit.use-case";
import { IssueRefundTool } from "./issue-refund.tool";

const CENTS_PER_REAL = 100;

const findOrderSchema = z.object({ orderId: z.string().describe("Número do pedido, por exemplo A-1042.") });
const refundLimitSchema = z.object({ plan: z.string().describe("Plano do cliente: gold, silver ou bronze.") });

/**
 * The sector money leaves from.
 *
 * Reading an order and reading a plan limit are methods here, because nothing outside a
 * conversation asks them that way. Refunding is a class, because the site refunds through
 * the same tool, and because a destructive tool is easier to find when it has its own file.
 */
@Agent({
	name: "billing",
	description: "Setor financeiro: pedidos, limite de reembolso por plano e reembolso.",
	prompt: `Você é o setor financeiro da loja Nébula.
Use find_order para ver o pedido e refund_limit para saber o teto do plano do cliente.
Para devolver dinheiro, use issue_refund: ele exige aprovação de um humano, então avise o cliente que o pedido de reembolso foi enviado para aprovação.
Responda em português, em no máximo duas frases, sempre com o valor em reais.`,
	tools: [IssueRefundTool],
})
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
		description: "Mostra um pedido: produto, valor pago, plano do cliente e situação.",
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
		description: "Quanto um plano pode receber de volta sem aprovação de um gerente, em reais.",
		schema: refundLimitSchema,
		effect: "read",
	})
	public refundLimit(input: z.infer<typeof refundLimitSchema>): unknown {
		return { plan: input.plan, limitBrl: this.refundLimitUseCase.execute(input.plan) / CENTS_PER_REAL };
	}
}

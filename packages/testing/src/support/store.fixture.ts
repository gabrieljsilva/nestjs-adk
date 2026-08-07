import {
	AdkAgent,
	AdkModule,
	AdkModuleOptions,
	AdkTool,
	Agent,
	DelegatesTo,
	EffectApprovalPolicy,
	RuntimeOptions,
	Tool,
	ToolEffect,
	TransfersTo,
} from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { z } from "zod";
import { ScriptedModel } from "../scripted-model";

const orderSchema = z.object({ orderId: z.string() });
const refundSchema = z.object({ orderId: z.string(), amountBrl: z.number() });

/** What the orders are worth, so an assertion can be a number only a tool could have produced. */
const TOTALS: Readonly<Record<string, number>> = { "A-1042": 349, "A-77": 120 };

@Injectable()
export class OrderService {
	public readonly refunded: { orderId: string; amountBrl: number }[] = [];

	public totalOf(orderId: string): number | undefined {
		return TOTALS[orderId];
	}

	public refund(orderId: string, amountBrl: number): void {
		this.refunded.push({ orderId, amountBrl });
	}
}

@Tool({ name: "find_order", description: "Finds one order by its number.", schema: orderSchema, effect: "read" })
export class FindOrderTool extends AdkTool<typeof orderSchema> {
	public constructor(private readonly orders: OrderService) {
		super();
	}

	public execute(input: z.infer<typeof orderSchema>): unknown {
		const total = this.orders.totalOf(input.orderId);
		return total === undefined ? { error: `no order ${input.orderId}` } : { orderId: input.orderId, totalBrl: total };
	}
}

@Tool({ name: "issue_refund", description: "Refunds an order.", schema: refundSchema, effect: "destructive" })
export class IssueRefundTool extends AdkTool<typeof refundSchema> {
	public constructor(private readonly orders: OrderService) {
		super();
	}

	public execute(input: z.infer<typeof refundSchema>): unknown {
		this.orders.refund(input.orderId, input.amountBrl);
		return { refunded: true, orderId: input.orderId };
	}
}

@Agent({
	name: "billing",
	description: "Answers about orders and money.",
	prompt: "Be brief.",
	tools: [FindOrderTool, IssueRefundTool],
})
export class BillingAgent extends AdkAgent {}

@Agent({ name: "warranty", description: "Answers about warranties.", prompt: "Be brief." })
export class WarrantyAgent extends AdkAgent {}

@Agent({ name: "concierge", description: "Greets and routes.", prompt: "Route when it is not yours." })
@TransfersTo(WarrantyAgent)
@DelegatesTo(BillingAgent)
export class ConciergeAgent extends AdkAgent {}

/** A caller of the agent, which is what a use case is from the runtime's side. */
@Injectable()
export class SendMessageUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public async execute(message: string): Promise<string> {
		return (await this.concierge.ask(message)).text;
	}
}

@Module({
	providers: [
		OrderService,
		FindOrderTool,
		IssueRefundTool,
		BillingAgent,
		WarrantyAgent,
		ConciergeAgent,
		SendMessageUseCase,
	],
})
export class StoreFeatureModule {}

/**
 * The smallest application that has everything the bed has to work over.
 *
 * Two tools of different effect, an agent that holds money in front of a human, an agent to
 * transfer to, one to delegate to, and a use case that asks a question without knowing any
 * of it. Every test in this package boots this, so what they prove is the API and not a
 * fixture written to make one of them pass.
 */
export function storeModule() {
	return {
		imports: [
			AdkModule.forRoot(
				AdkModuleOptions.from({
					defaultModel: new ScriptedModel("module-default"),
					runtime: RuntimeOptions.from({ approvals: EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE) }),
				}),
			),
			StoreFeatureModule,
		],
	};
}

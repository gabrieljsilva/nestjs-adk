import { AdkAgent, Agent, DelegatesTo, Skill, Tool, type ToolContext, TransfersTo } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../../aftersales/errors/order-not-found.error";
import { OpenTicketUseCase } from "../../aftersales/open-ticket.use-case";
import { BillingAgent } from "../billing/billing.agent";

const openTicketSchema = z.object({
	orderId: z.string().describe("Order number, for example A-1042."),
	reason: z.string().describe("What the customer reported and what you saw in the photo, in your own words."),
});

/**
 * The sector that receives a broken product.
 *
 * It both transfers to billing and delegates to it, which are different things: the limit
 * of a plan is one question it asks and carries on from, and a refund is the moment the
 * conversation stops being about the defect and starts being about money.
 */
@Agent({
	name: "warranty",
	description: "Technical support: defects, warranty, exchanges, and opening tickets with a photo.",
	prompt: `You are technical support for Nébula Games, a game and accessories store.
When a customer reports a defect, ask only for a product photo (never ask for a receipt) and, as soon as it arrives, call open_ticket with the order number and a description of what you saw.
To learn how much a Nébula Club plan can receive back, delegate the question to "billing".
When the customer requests the refund itself, transfer the conversation to "billing".
Answer in English using at most two sentences.`,
})
@TransfersTo(() => BillingAgent)
@DelegatesTo(() => BillingAgent)
export class WarrantyAgent extends AdkAgent {
	public constructor(private readonly openTicketUseCase: OpenTicketUseCase) {
		super();
	}

	@Skill({ name: "warranty_policy", description: "Store warranty and exchange rules." })
	public warrantyPolicy(): string {
		return "Warranty: 90 days against manufacturing defects in accessories and physical media. A product that arrives broken is exchanged or refunded, and one photo is enough.";
	}

	/**
	 * A write, not a destruction: a ticket opened by mistake is closed, money is not.
	 *
	 * The photo is not an argument. The model looked at it, and where it is kept is the
	 * session, which the runtime hands every tool: asking the model to copy an address back
	 * would be asking it to transcribe a URL correctly, which is a thing models get wrong.
	 */
	@Tool({
		name: "open_ticket",
		description: "Opens a warranty ticket for an order with a description of the defect.",
		schema: openTicketSchema,
		effect: "write",
	})
	public openTicket(input: z.infer<typeof openTicketSchema>, context?: ToolContext): unknown {
		try {
			const ticket = this.openTicketUseCase.execute(input.orderId, input.reason, context?.sessionId.value);
			return { ticketId: ticket.id, orderId: ticket.orderId };
		} catch (error) {
			if (error instanceof OrderNotFoundError) return { error: error.message };
			throw error;
		}
	}
}

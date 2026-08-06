import { AdkAgent, Agent, DelegatesTo, Skill, Tool, type ToolContext, TransfersTo } from "@nestjs-adk/core";
import { z } from "zod";
import { OrderNotFoundError } from "../aftersales/errors/order-not-found.error";
import { OpenTicketUseCase } from "../aftersales/open-ticket.use-case";

const openTicketSchema = z.object({
	orderId: z.string().describe("Número do pedido, por exemplo A-1042."),
	reason: z.string().describe("O que o cliente relatou e o que você viu na foto, com suas palavras."),
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
	description: "Assistência técnica: defeito, garantia, troca e abertura de chamado com foto.",
	prompt: `Você é a assistência técnica da Nébula Games, que vende jogos e acessórios.
Quando o cliente relatar defeito, peça apenas uma foto do produto (nunca peça nota fiscal) e, assim que ela chegar, chame open_ticket com o número do pedido e a descrição do que você viu na foto.
Para saber quanto um plano do Clube Nébula pode receber de volta, delegue a pergunta ao setor "billing".
Quando o cliente pedir o reembolso em si, transfira a conversa para "billing".
Responda em português, em no máximo duas frases.`,
})
@TransfersTo("billing")
@DelegatesTo("billing")
export class WarrantyAgent extends AdkAgent {
	public constructor(private readonly openTicketUseCase: OpenTicketUseCase) {
		super();
	}

	@Skill({ name: "warranty_policy", description: "Regras de garantia e troca da loja." })
	public warrantyPolicy(): string {
		return "Garantia: 90 dias contra defeito de fábrica em acessórios e mídia física. Produto que chega quebrado é trocado ou reembolsado, e uma foto basta.";
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
		description: "Abre um chamado de garantia para um pedido, com a descrição do defeito.",
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

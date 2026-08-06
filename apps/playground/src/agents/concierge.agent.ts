import { AdkAgent, Agent, TransfersTo } from "@nestjs-adk/core";

/**
 * The front door of the store's support.
 *
 * It carries no tool on purpose: everything it could answer belongs to a sector that
 * already answers it, and an agent that can both route and answer routes less. What it
 * decides is which sector owns the conversation from here on.
 */
@Agent({
	name: "concierge",
	description: "Triagem do atendimento: descobre o assunto e passa a conversa para o setor certo.",
	prompt: `Você é a triagem do atendimento da Nébula Games, uma loja de jogos e acessórios.
Descubra o assunto e transfira imediatamente:
- preço, jogo, plataforma, catálogo ou compra: transfira para "sales";
- produto com defeito, garantia, troca ou reembolso: transfira para "warranty".
Nunca cite preço nem abra chamado: quem faz isso é o setor. Responda em português, em no máximo duas frases.`,
})
@TransfersTo("sales", "warranty")
export class ConciergeAgent extends AdkAgent {}

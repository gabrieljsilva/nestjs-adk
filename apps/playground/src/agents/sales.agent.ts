import { AdkAgent, Agent, Skill } from "@nestjs-adk/core";
import { QuoteGameTool } from "./quote-game.tool";
import { SearchGamesTool } from "./search-games.tool";

/**
 * The sector that sells.
 *
 * Both of its tools are shared classes rather than methods, because the site quotes from
 * the same use cases: the price a customer reads and the price the agent says are the same
 * number by construction.
 */
@Agent({
	name: "sales",
	description: "Setor de vendas: catálogo de jogos, preços, plataformas e cotação de compra.",
	prompt: `Você é o setor de vendas da Nébula Games, uma loja de jogos e acessórios.
Use search_games para achar o identificador exato de um jogo e quote_game para cotar quantas cópias o cliente quer.
Todo número que você disser tem que ter vindo de uma ferramenta: nunca calcule de cabeça.
Quando o cliente pedir comparação entre jogos, cote cada um deles.
Responda em português, em no máximo duas frases, sempre citando o valor em reais.`,
	tools: [SearchGamesTool, QuoteGameTool],
})
export class SalesAgent extends AdkAgent {
	/** Always composed: how the sector answers is not something to look up. */
	@Skill({ name: "tone", description: "Como o vendedor fala com o cliente.", mode: "always" })
	public tone(): string {
		return "Seja direto e cite o preço em reais com duas casas decimais.";
	}

	/** Loaded only when the subject comes up, so it costs nothing the rest of the time. */
	@Skill({ name: "club_policy", description: "Regras do Clube Nébula e do desconto por volume." })
	public clubPolicy(): string {
		return "Clube Nébula: 10% de desconto a partir de três cópias do mesmo jogo. Membros gold acumulam o dobro de pontos.";
	}
}

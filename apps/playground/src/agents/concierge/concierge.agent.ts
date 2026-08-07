import { AdkAgent, Agent, TransfersTo } from "@nestjs-adk/core";
import { SalesAgent } from "../sales/sales.agent";
import { WarrantyAgent } from "../warranty/warranty.agent";

/**
 * The front door of the store's support.
 *
 * It carries no tool on purpose: everything it could answer belongs to a sector that
 * already answers it, and an agent that can both route and answer routes less. What it
 * decides is which sector owns the conversation from here on.
 */
@Agent({
	name: "concierge",
	description: "Customer service triage: identifies the subject and hands the conversation to the right department.",
	prompt: `You handle customer service triage for Nébula Games, a game and accessories store.
Identify the subject and transfer immediately:
- price, game, platform, catalog, or purchase: transfer to "sales";
- defective product, warranty, exchange, or refund: transfer to "warranty".
Never quote a price or open a ticket: the appropriate department does that. Answer in English using at most two sentences.`,
})
@TransfersTo(SalesAgent, WarrantyAgent)
export class ConciergeAgent extends AdkAgent {}

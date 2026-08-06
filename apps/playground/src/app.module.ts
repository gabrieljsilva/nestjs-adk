import {
	AdkModule,
	AdkModuleOptions,
	EffectApprovalPolicy,
	RuntimeOptions,
	SqliteConnection,
	SqliteSessionStorage,
	TokenThresholdCompactionPolicy,
	ToolEffect,
} from "@nestjs-adk/core";
import { GeminiModel } from "@nestjs-adk/google";
import { Module } from "@nestjs/common";
import { AftersalesController } from "./aftersales/aftersales.controller";
import { FindOrderUseCase } from "./aftersales/find-order.use-case";
import { IssueRefundUseCase } from "./aftersales/issue-refund.use-case";
import { OpenTicketUseCase } from "./aftersales/open-ticket.use-case";
import { OrderRepository } from "./aftersales/order.repository";
import { OrderService } from "./aftersales/order.service";
import { RefundLimitUseCase } from "./aftersales/refund-limit.use-case";
import { RefundPolicy } from "./aftersales/refund-policy";
import { RefundService } from "./aftersales/refund.service";
import { TicketRepository } from "./aftersales/ticket.repository";
import { TicketService } from "./aftersales/ticket.service";
import { BillingAgent } from "./agents/billing.agent";
import { ConciergeAgent } from "./agents/concierge.agent";
import { IssueRefundTool } from "./agents/issue-refund.tool";
import { QuoteGameTool } from "./agents/quote-game.tool";
import { SalesAgent } from "./agents/sales.agent";
import { SearchGamesTool } from "./agents/search-games.tool";
import { WarrantyAgent } from "./agents/warranty.agent";
import { CatalogController } from "./catalog/catalog.controller";
import { CatalogService } from "./catalog/catalog.service";
import { GameRepository } from "./catalog/game.repository";
import { QuoteGameUseCase } from "./catalog/quote-game.use-case";
import { SearchGamesUseCase } from "./catalog/search-games.use-case";
import { ApproveToolCallUseCase } from "./chat/approve-tool-call.use-case";
import { ChatController } from "./chat/chat.controller";
import { InspectSessionUseCase } from "./chat/inspect-session.use-case";
import { RejectToolCallUseCase } from "./chat/reject-tool-call.use-case";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { StoreSummarizer } from "./chat/store-summarizer";
import { StoreDatabase } from "./shared/store-database";
import { StoreSeed } from "./shared/store-seed";

const MODEL = process.env.PLAYGROUND_MODEL ?? "gemini-3.5-flash-lite";

/**
 * One SQLite file holds the conversations and the store's own tables.
 *
 * They are one application: an order refunded in a conversation and the row that says so
 * have to be restored together or not at all. Without a path it lives as long as the
 * process, which is what a developer trying the app out wants.
 */
const connection = new SqliteConnection(process.env.PLAYGROUND_DB ?? ":memory:");

/**
 * What the store hands the runtime.
 *
 * Money leaving waits for a human and everything else runs, which is the whole of the
 * approval policy. It is exported because a test replaces this object to put a scripted
 * model behind the same application, and replacing it must not quietly change the policy.
 */
const storeModel = new GeminiModel(MODEL, { apiKey: process.env.GEMINI_API_KEY ?? "" });

/**
 * A conversation that outgrows the window is shortened, not dropped.
 *
 * The ceiling is measured, so a session nobody has called is never compacted. Past it,
 * the oldest closed exchanges leave and a summary takes their place: what is kept is the
 * recent turns plus a few sentences saying what happened before them. Without the
 * summarizer the same conversation would simply forget, and a customer who gave their
 * order number ten turns ago would have to give it again.
 */
const COMPACTION = new TokenThresholdCompactionPolicy(24_000, 12_000, 4);

export const storeOptions = new AdkModuleOptions(
	storeModel,
	new SqliteSessionStorage(connection),
	undefined,
	undefined,
	undefined,
	new RuntimeOptions(
		undefined,
		undefined,
		[],
		undefined,
		EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE),
		undefined,
		undefined,
		undefined,
		new StoreSummarizer(storeModel),
		undefined,
		undefined,
		COMPACTION,
	),
);

/**
 * The store, wired.
 *
 * A plain module: the runtime is imported like any other library module, and everything
 * the application owns is a provider of its own. A test puts a different model behind it
 * by overriding `ADK_OPTIONS`, the same way it would override any other provider.
 */
@Module({
	imports: [AdkModule.forRoot(storeOptions)],
	controllers: [ChatController, CatalogController, AftersalesController],
	providers: [
		{ provide: StoreDatabase, useValue: new StoreDatabase(connection) },
		StoreSeed,
		GameRepository,
		OrderRepository,
		TicketRepository,
		CatalogService,
		OrderService,
		TicketService,
		RefundPolicy,
		RefundService,
		SearchGamesUseCase,
		QuoteGameUseCase,
		FindOrderUseCase,
		OpenTicketUseCase,
		RefundLimitUseCase,
		IssueRefundUseCase,
		SendMessageUseCase,
		ApproveToolCallUseCase,
		RejectToolCallUseCase,
		InspectSessionUseCase,
		SearchGamesTool,
		QuoteGameTool,
		IssueRefundTool,
		ConciergeAgent,
		SalesAgent,
		WarrantyAgent,
		BillingAgent,
	],
})
export class AppModule {}

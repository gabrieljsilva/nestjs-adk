import {
	AdkModule,
	AdkModuleOptions,
	EffectApprovalPolicy,
	LiteLLMPricingSource,
	RuntimeOptions,
	SqliteSessionStorage,
	TokenThresholdCompactionPolicy,
	ToolEffect,
} from "@nestjs-adk/core";
import { GeminiModel } from "@nestjs-adk/google";
import { Module } from "@nestjs/common";
import { AftersalesModule } from "./aftersales/aftersales.module";
import { AgentsModule } from "./agents/agents.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ApproveToolCallUseCase } from "./chat/approve-tool-call.use-case";
import { ChatController } from "./chat/chat.controller";
import { InspectSessionUseCase } from "./chat/inspect-session.use-case";
import { RejectToolCallUseCase } from "./chat/reject-tool-call.use-case";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { StoreSummarizer } from "./chat/store-summarizer";
import { SharedModule, storeConnection } from "./shared/shared.module";
import { StoreSeed } from "./shared/store-seed";

const MODEL = process.env.PLAYGROUND_MODEL ?? "gemini-3.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (GEMINI_API_KEY === undefined) throw new Error("GEMINI_API_KEY is required");

/**
 * One SQLite file holds the conversations and the store's own tables.
 *
 * They are one application: an order refunded in a conversation and the row that says so
 * have to be restored together or not at all. Without a path it lives as long as the
 * process, which is what a developer trying the app out wants.
 */
export const geminiFlashLite = new GeminiModel(MODEL, { apiKey: GEMINI_API_KEY });

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

export const storeOptions = AdkModuleOptions.from({
	defaultModel: geminiFlashLite,
	storage: new SqliteSessionStorage(storeConnection),
	runtime: RuntimeOptions.from({
		approvals: EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE),
		summarizer: new StoreSummarizer(geminiFlashLite),
		compaction: COMPACTION,
		pricing: new LiteLLMPricingSource(),
	}),
});

/**
 * The store, wired. Each feature owns and exports its providers; this root only composes
 * the application and the chat entry points.
 */
@Module({
	imports: [AdkModule.forRoot(storeOptions), SharedModule, CatalogModule, AftersalesModule, AgentsModule],
	controllers: [ChatController],
	providers: [StoreSeed, SendMessageUseCase, ApproveToolCallUseCase, RejectToolCallUseCase, InspectSessionUseCase],
})
export class AppModule {}

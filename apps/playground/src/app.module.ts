import {
	AdkModule,
	type AdkModuleOptionsInput,
	EffectApprovalPolicy,
	InlineAttachmentResolver,
	LiteLLMPricingSource,
	RunLimits,
	Secret,
	SqliteSessionStorage,
	ToolEffect,
	WindowShareCompactionPolicy,
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
import { SharedModule, storeConnection, uploadsVault } from "./shared/shared.module";
import { StoreSeed } from "./shared/store-seed";

const MODEL = process.env.PLAYGROUND_MODEL ?? "gemini-3.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

export const geminiFlashLite = new GeminiModel(MODEL, {
	apiKey: new Secret(GEMINI_API_KEY),
	contextWindowTokens: 1_048_576,
	temperature: 0,
});

const COMPACTION = new WindowShareCompactionPolicy({ maxShare: 0.02, targetShare: 0.01, keepRecentBlocks: 4 });

const STORE_LIMITS = new RunLimits(8);

export const storeOptions: AdkModuleOptionsInput = {
	defaultModel: geminiFlashLite,
	storage: new SqliteSessionStorage(storeConnection),
	runtime: {
		tools: { approvals: EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE) },
		context: {
			summarizer: new StoreSummarizer(geminiFlashLite),
			compaction: COMPACTION,
			attachments: new InlineAttachmentResolver(async (externalId) => uploadsVault.find(externalId)),
		},
		cost: { pricing: new LiteLLMPricingSource() },
		limits: STORE_LIMITS,
	},
};

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

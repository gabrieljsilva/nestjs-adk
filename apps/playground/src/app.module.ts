import {
	AdkModule,
	AdkModuleOptions,
	EffectApprovalPolicy,
	InlineAttachmentResolver,
	LiteLLMPricingSource,
	RunLimits,
	RuntimeOptions,
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (GEMINI_API_KEY === undefined) throw new Error("GEMINI_API_KEY is required");

/**
 * One SQLite file holds the conversations and the store's own tables.
 *
 * They are one application: an order refunded in a conversation and the row that says so
 * have to be restored together or not at all. Without a path it lives as long as the
 * process, which is what a developer trying the app out wants.
 */
/**
 * The window is declared because a policy that reasons in shares needs one to be a share of.
 *
 * A model that never states its window is never compacted, since the alternative is the
 * runtime inventing a size for somebody's conversation. This one has a million tokens and
 * says so, which is also what lets `contextBudget` answer how full a chat is.
 */
export const geminiFlashLite = new GeminiModel(MODEL, {
	apiKey: new Secret(GEMINI_API_KEY),
	contextWindowTokens: 1_048_576,
});

/**
 * A conversation that outgrows the window is shortened, not dropped.
 *
 * The ceiling is measured, so a session nobody has called is never compacted. Past it,
 * the oldest closed exchanges leave and a summary takes their place: what is kept is the
 * recent turns plus a few sentences saying what happened before them. Without the
 * summarizer the same conversation would simply forget, and a customer who gave their
 * order number ten turns ago would have to give it again.
 *
 * The shares are far below the standard ones on purpose. A store conversation would never
 * reach nine tenths of a million token window, so declaring the default here would be
 * shipping a demo of something that never runs.
 */
const COMPACTION = new WindowShareCompactionPolicy({ maxShare: 0.02, targetShare: 0.01, keepRecentBlocks: 4 });

/**
 * What any conversation here may spend before the runtime stops it.
 *
 * No sector of this store needs eight round trips to answer, so a run that reaches them is
 * a model looping rather than a customer being served, and stopping it is cheaper than the
 * next call. A sector that genuinely runs longer declares its own in `@Agent`, which
 * replaces this one rather than being capped by it: sales does, because comparing titles
 * is one quote per title.
 */
const STORE_LIMITS = new RunLimits(8);

export const storeOptions = AdkModuleOptions.from({
	defaultModel: geminiFlashLite,
	storage: new SqliteSessionStorage(storeConnection),
	runtime: RuntimeOptions.from({
		tools: { approvals: EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE) },
		context: {
			summarizer: new StoreSummarizer(geminiFlashLite),
			compaction: COMPACTION,
			// A question names an upload by id; the vault is asked again on every projection.
			attachments: new InlineAttachmentResolver(async (externalId) => uploadsVault.find(externalId)),
		},
		cost: { pricing: new LiteLLMPricingSource() },
		limits: STORE_LIMITS,
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

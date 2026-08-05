import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import type { ModelUsage } from "../../domain/model/model-usage";
import type { ToolDeclaration } from "../../domain/model/tool-declaration";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions";

/**
 * Everything needed to turn a session into the next model call.
 *
 * Without a compaction policy nothing is ever compacted: shortening someone's
 * conversation is a decision, and it is taken where it was declared.
 *
 * `lastUsage` is what the provider reported for the previous call of this session,
 * together with how large the prompt was when it was reported. It is the only source of
 * an absolute size in the whole pipeline, so without it a context has a composition and
 * no measured size, and nothing is refused on guesswork.
 */
export class PrepareContextCommand {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly model: LlmModel,
		public readonly tools: readonly ToolDeclaration[] = [],
		public readonly runtimeInstructions?: PromptInstructions,
		public readonly agentPrompt?: PromptInstructions,
		public readonly compaction?: AdkCompactionPolicy,
		public readonly lastUsage?: ModelUsage,
		public readonly lastUsageCharacters?: number,
		/** Which run is asking, which is what decides whether a run scoped skill is still loaded. */
		public readonly runId?: AgentRunId,
	) {}
}

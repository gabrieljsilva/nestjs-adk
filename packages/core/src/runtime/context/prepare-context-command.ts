import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import type { PromptMeasurement } from "../../domain/model/prompt-measurement";
import type { ToolDeclaration } from "../../domain/model/tool-declaration";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import type { RunContext } from "../../domain/run/run-context";

/**
 * Everything needed to turn a session into the next model call.
 *
 * Without a compaction policy nothing is ever compacted: shortening someone's
 * conversation is a decision, and it is taken where it was declared.
 *
 * `lastPrompt` is what the provider reported for the previous call of this session,
 * together with how large the prompt was when it was reported. It is the only source of
 * an absolute size in the whole pipeline, so without it a context has a size in
 * characters and none in tokens, and nothing is refused on guesswork.
 */
export class PrepareContextCommand {
	public constructor(
		/** Where this call is being prepared, handed on to the projector and the strategy. */
		public readonly context: RunContext,
		public readonly model: LlmModel,
		public readonly tools: readonly ToolDeclaration[] = [],
		public readonly runtimeInstructions?: PromptInstructions,
		public readonly agentPrompt?: PromptInstructions,
		public readonly compaction?: AdkCompactionPolicy,
		public readonly lastPrompt?: PromptMeasurement,
		/** The shape the agent answers in, carried through so the projection can ask for it. */
		public readonly outputSchema?: object,
	) {}

	public get sessionId(): SessionId {
		return this.context.sessionId;
	}

	/** Which run is asking, which is what decides whether a run scoped skill is still loaded. */
	public get runId(): AgentRunId {
		return this.context.runId;
	}
}

import type { AgentName } from "../../domain/agent/agent-name";
import type { LlmModel } from "../../domain/model/llm-model";
import type { AskInput } from "../../domain/session/ask-input";
import { RunLimits } from "../../domain/session/run-limits";
import { SessionMode } from "../../domain/session/session-mode";
import type { SessionOwner } from "../../domain/session/session-owner";

/**
 * One command to run, resolved: which agent, what was said and under which limits.
 *
 * The model is an override for this call alone, for routing a single request without
 * redeclaring the agent. It is a production feature and not a test hook: a test replaces
 * the `ModelResolver` instead, which is a port the container can swap.
 *
 * The limits are the ones already resolved from the module, the agent and the call, in
 * that order. Resolving them here rather than inside the run keeps the decision in one
 * place and out of the loop that has to obey it.
 */
export class AgentRunCommand {
	public constructor(
		public readonly agent: AgentName,
		public readonly input: AskInput,
		public readonly limits: RunLimits = RunLimits.none(),
		public readonly mode: SessionMode = SessionMode.EPHEMERAL,
		public readonly owner?: SessionOwner,
		public readonly model?: LlmModel,
		/**
		 * Hands the session to another agent before this message is answered.
		 *
		 * It is the handover a developer decides, next to the one a model decides by calling
		 * the transfer tool. Both go through the same declared edges: code that could move a
		 * session anywhere would make the edges a suggestion.
		 */
		public readonly transferTo?: AgentName,
	) {}

	public get continuesSession(): boolean {
		return this.input.continuesSession;
	}
}

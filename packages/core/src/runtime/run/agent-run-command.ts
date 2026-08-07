import type { ToolSource } from "../../contracts/tool-source";
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
		/**
		 * Tool sources opened for this run alone, on top of the module's.
		 *
		 * A source is a connection with a credential behind it, and the credential often belongs
		 * to whoever is asking rather than to the application. Declaring it here keeps one user's
		 * connection inside one run: it opens when the run starts and closes when it ends,
		 * however it ends.
		 */
		public readonly sources: readonly ToolSource[] = [],
		/**
		 * The caller's stop button, for a run nobody is waiting for anymore.
		 *
		 * Aborting it cancels this run and everything it delegated, and the journal records
		 * a cancellation rather than a failure. It is the only way to stop the work: a caller
		 * that walks away from the stream stops reading, while the provider goes on generating
		 * an answer nobody will see and billing for it.
		 */
		public readonly signal?: AbortSignal,
	) {}

	public get continuesSession(): boolean {
		return this.input.continuesSession;
	}
}

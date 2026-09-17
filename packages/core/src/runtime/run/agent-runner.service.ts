import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot.value-object";
import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import type { ApproveInput } from "../../domain/session/input/approve-input.command";
import type { DelegateInput } from "../../domain/session/input/delegate-input.command";
import type { RejectInput } from "../../domain/session/input/reject-input.command";
import type { AgentResult } from "../../domain/session/run/agent-result.value-object";
import type { AgentRunCommand } from "./agent-run.command";
import type { AskAgentUseCase } from "./use-cases/ask-agent.use-case";
import type { DecideApprovalUseCase } from "./use-cases/decide-approval.use-case";
import type { DelegateAgentUseCase } from "./use-cases/delegate-agent.use-case";
import type { ExplainAgentUseCase } from "./use-cases/explain-agent.use-case";
import type { StreamAgentUseCase } from "./use-cases/stream-agent.use-case";

/**
 * What an application calls to talk to an agent.
 *
 * Six verbs and nothing else: ask a question, watch one being answered, look at what a
 * question was actually sent as, hand one task to a specialist, agree to a call somebody
 * has to answer for, or refuse it. Each is one use case, and each lives in its own
 * class, because the thing they have in common is the name a consumer holds and nothing more.
 *
 * This class is the name. It is what stays still while everything under it moves, which
 * is why it contains no orchestration of its own: a public surface that also decides in
 * what order things happen cannot be changed without changing what callers depend on.
 */
export class AgentRunner {
	public constructor(
		private readonly asking: AskAgentUseCase,
		private readonly deciding: DecideApprovalUseCase,
		private readonly streaming: StreamAgentUseCase,
		private readonly explaining: ExplainAgentUseCase,
		private readonly delegating: DelegateAgentUseCase,
	) {}

	public async ask(command: AgentRunCommand): Promise<AgentResult> {
		return this.asking.execute(command);
	}

	/**
	 * The same question as `ask`, watched while it is answered.
	 * The chunks are what the executor aggregates into the answer, and the result comes back
	 * as the generator's return value once the run has ended.
	 */
	public stream(command: AgentRunCommand): AsyncGenerator<ModelChunk, AgentResult> {
		return this.streaming.execute(command);
	}

	/**
	 * Runs the command and answers what each model call was actually given.
	 * It is the same run as `ask`, watched: same session, same journal and same cost.
	 */
	public async explain(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		return this.explaining.execute(command);
	}

	/**
	 * Has another agent answer one task, without giving up the conversation.
	 * It is the code side of the delegation tool: same declared edges, same events, and the
	 * agent answering the session stays exactly who it was.
	 */
	public async delegate(input: DelegateInput): Promise<AgentResult> {
		return this.delegating.execute(input);
	}

	/** Lets a held turn run, under a new run that points back at the suspended one. */
	public async approve(input: ApproveInput): Promise<AgentResult> {
		return this.deciding.execute(input.sessionId, input.callId, "granted", {
			by: input.approvedBy,
			actor: input.actor,
			sources: input.sources,
			signal: input.signal,
			toolCalls: input.toolCalls,
		});
	}

	/** Refuses a held call and tells the model so, which is a result like any other. */
	public async reject(input: RejectInput): Promise<AgentResult> {
		return this.deciding.execute(input.sessionId, input.callId, "denied", {
			by: input.deniedBy,
			actor: input.actor,
			reason: input.reason,
			sources: input.sources,
			signal: input.signal,
			toolCalls: input.toolCalls,
		});
	}
}

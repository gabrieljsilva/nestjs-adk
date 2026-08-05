import type { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import type { ModelChunk } from "../../domain/model/model-chunk";
import type { AgentResult } from "../../domain/session/agent-result";
import type { ApproveInput } from "../../domain/session/approve-input";
import type { DelegateInput } from "../../domain/session/delegate-input";
import type { RejectInput } from "../../domain/session/reject-input";
import type { AgentRunCommand } from "./agent-run-command";
import type { AskAgent } from "./ask-agent";
import type { DecideApproval } from "./decide-approval";
import type { DelegateAgent } from "./delegate-agent";
import type { ExplainAgent } from "./explain-agent";
import type { StreamAgent } from "./stream-agent";

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
		private readonly asking: AskAgent,
		private readonly deciding: DecideApproval,
		private readonly streaming: StreamAgent,
		private readonly explaining: ExplainAgent,
		private readonly delegating: DelegateAgent,
	) {}

	public async ask(command: AgentRunCommand): Promise<AgentResult> {
		return this.asking.handle(command);
	}

	/**
	 * The same question as `ask`, watched while it is answered.
	 * The chunks are what the executor aggregates into the answer, and the result comes back
	 * as the generator's return value once the run has ended.
	 */
	public stream(command: AgentRunCommand): AsyncGenerator<ModelChunk, AgentResult> {
		return this.streaming.handle(command);
	}

	/**
	 * Runs the command and answers what each model call was actually given.
	 * It is the same run as `ask`, watched: same session, same journal and same cost.
	 */
	public async explain(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		return this.explaining.handle(command);
	}

	/**
	 * Has another agent answer one task, without giving up the conversation.
	 * It is the code side of the delegation tool: same declared edges, same events, and the
	 * agent answering the session stays exactly who it was.
	 */
	public async delegate(input: DelegateInput): Promise<AgentResult> {
		return this.delegating.handle(input);
	}

	/** Lets a held turn run, under a new run that points back at the suspended one. */
	public async approve(input: ApproveInput): Promise<AgentResult> {
		return this.deciding.handle(input.sessionId, input.callId, "granted", input.approvedBy);
	}

	/** Refuses a held call and tells the model so, which is a result like any other. */
	public async reject(input: RejectInput): Promise<AgentResult> {
		return this.deciding.handle(input.sessionId, input.callId, "denied", input.deniedBy, input.reason);
	}
}

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

	public stream(command: AgentRunCommand): AsyncGenerator<ModelChunk, AgentResult> {
		return this.streaming.execute(command);
	}

	public async explain(command: AgentRunCommand): Promise<readonly ContextSnapshot[]> {
		return this.explaining.execute(command);
	}

	public async delegate(input: DelegateInput): Promise<AgentResult> {
		return this.delegating.execute(input);
	}

	public async approve(input: ApproveInput): Promise<AgentResult> {
		return this.deciding.execute(input.sessionId, input.callId, "granted", {
			by: input.approvedBy,
			actor: input.actor,
			sources: input.sources,
			signal: input.signal,
			toolCalls: input.toolCalls,
		});
	}

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

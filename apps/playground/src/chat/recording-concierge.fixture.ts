import {
	AgentResult,
	AgentRunId,
	AgentRunStatus,
	type AskOptions,
	SessionId,
	type SessionInspection,
	type ToolCallId,
} from "@nestjs-adk/core";
import { ConciergeAgent } from "../agents/concierge.agent";

const SESSION = "session-1";

/**
 * The concierge, with the runtime taken out from under it.
 *
 * The use cases above it have one job, which is handing what a request said to the agent
 * without changing it. Recording what arrived is the whole assertion, so the answer is a
 * constant and `inspect` refuses on purpose: building a real inspection would mean
 * building a journal, and that is what the integration suite is for.
 */
export class RecordingConcierge extends ConciergeAgent {
	public readonly asked: string[] = [];
	public readonly options: (AskOptions | SessionId | undefined)[] = [];
	public readonly decided: string[] = [];
	public inspected?: SessionId | string;

	public override async ask(message: string, options?: AskOptions | SessionId): Promise<AgentResult> {
		this.asked.push(message);
		this.options.push(options);
		return this.answer("respondido");
	}

	public override async approve(
		sessionId: SessionId | string,
		callId: ToolCallId,
		approvedBy?: string,
	): Promise<AgentResult> {
		this.decided.push(`approve:${String(sessionId)}:${callId.value}:${approvedBy ?? ""}`);
		return this.answer("aprovado");
	}

	public override async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
	): Promise<AgentResult> {
		this.decided.push(`reject:${String(sessionId)}:${callId.value}:${reason}:${deniedBy ?? ""}`);
		return this.answer("recusado");
	}

	public override async inspect(sessionId: SessionId | string): Promise<SessionInspection> {
		this.inspected = sessionId;
		throw new Error("no runtime behind this agent");
	}

	/** The single option object of the last question, for a spec that asserts what was attached. */
	public get lastOptions(): AskOptions {
		const last = this.options.at(-1);
		return last === undefined || last instanceof SessionId ? {} : last;
	}

	private answer(text: string): AgentResult {
		return new AgentResult(SessionId.from(SESSION), AgentRunId.from("run-1"), AgentRunStatus.COMPLETED, text);
	}
}

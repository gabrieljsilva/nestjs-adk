import {
	AgentResult,
	AgentRunId,
	AgentRunStatus,
	type AskOptions,
	PendingCall,
	SessionId,
	type SessionInspection,
	ToolCallId,
} from "@nestjs-adk/core";

/**
 * One question the stub was asked, with the options it came with.
 */
export interface StubbedAsk {
	readonly message: string;
	readonly options?: AskOptions | SessionId;
}

/**
 * One approval or rejection the stub was given, and what it named.
 */
export interface StubbedDecision {
	readonly kind: "approve" | "reject";
	readonly sessionId: string;
	readonly callId: string;
	readonly reason?: string;
	readonly by?: string;
}

const STUB_SESSION = "stub-session";
const STUB_RUN = "stub-run";

/**
 * A whole agent replaced, for testing the caller rather than the agent: no container and no
 * runtime, only the answers the test queued and a record of what was asked.
 *
 * It answers `ask`, `approve` and `reject`, and refuses `inspect` on purpose, since reading
 * where a session stands means there is a runtime and that is what the bed is for.
 */
export class AgentStub {
	private readonly answers: AgentResult[] = [];
	private fallback: AgentResult = AgentStub.completed("answered");

	public readonly asks: StubbedAsk[] = [];
	public readonly decisions: StubbedDecision[] = [];

	public static completed(text: string, sessionId = STUB_SESSION): AgentResult {
		return new AgentResult(SessionId.from(sessionId), AgentRunId.from(STUB_RUN), AgentRunStatus.COMPLETED, text);
	}

	public static awaiting(tool: string, args: Record<string, unknown> = {}, callId = "stub-call"): AgentResult {
		return new AgentResult(SessionId.from(STUB_SESSION), AgentRunId.from(STUB_RUN), AgentRunStatus.SUSPENDED, "", [
			new PendingCall(ToolCallId.from(callId), tool, args, "destructive"),
		]);
	}

	public answersWith(result: AgentResult | string): this {
		this.fallback = typeof result === "string" ? AgentStub.completed(result) : result;
		return this;
	}

	public thenAnswers(result: AgentResult | string): this {
		this.answers.push(typeof result === "string" ? AgentStub.completed(result) : result);
		return this;
	}

	public get lastOptions(): AskOptions {
		const last = this.asks.at(-1)?.options;
		return last === undefined || last instanceof SessionId ? {} : last;
	}

	public async ask(message: string, options?: AskOptions | SessionId): Promise<AgentResult> {
		this.asks.push({ message, options });
		return this.answers.shift() ?? this.fallback;
	}

	public async approve(sessionId: SessionId | string, callId: ToolCallId, approvedBy?: string): Promise<AgentResult> {
		this.decisions.push({ kind: "approve", sessionId: String(sessionId), callId: callId.value, by: approvedBy });
		return this.answers.shift() ?? this.fallback;
	}

	public async reject(
		sessionId: SessionId | string,
		callId: ToolCallId,
		reason: string,
		deniedBy?: string,
	): Promise<AgentResult> {
		this.decisions.push({
			kind: "reject",
			sessionId: String(sessionId),
			callId: callId.value,
			reason,
			by: deniedBy,
		});
		return this.answers.shift() ?? this.fallback;
	}

	public async inspect(): Promise<SessionInspection> {
		throw new Error("no runtime behind this agent: use AdkTestBed when the test needs a session");
	}
}

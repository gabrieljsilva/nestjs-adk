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

/** One question the stub was asked, with everything that came with it. */
export interface StubbedAsk {
	readonly message: string;
	readonly options?: AskOptions | SessionId;
}

/** One decision the stub was told about. */
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
 * An agent with the runtime taken out from under it.
 *
 * This is for testing the caller, not the agent: a use case that hands a request to an
 * agent has one job, which is handing over what the request said without changing it, and
 * recording what arrived is the whole assertion. Nothing here runs a model, a tool or a
 * session, and that is deliberate: a test that needs any of those wants the bed.
 *
 * The class is extended by a fake of the agent under test, which keeps it typed as the
 * class the use case injects.
 */
export class AgentStub {
	private readonly answers: AgentResult[] = [];
	private fallback: AgentResult = AgentStub.completed("answered");

	public readonly asks: StubbedAsk[] = [];
	public readonly decisions: StubbedDecision[] = [];

	/** A completed run answering these words, which is what most callers need. */
	public static completed(text: string, sessionId = STUB_SESSION): AgentResult {
		return new AgentResult(SessionId.from(sessionId), AgentRunId.from(STUB_RUN), AgentRunStatus.COMPLETED, text);
	}

	/** A run that stopped in front of a human, waiting on one named tool. */
	public static awaiting(tool: string, args: Record<string, unknown> = {}, callId = "stub-call"): AgentResult {
		return new AgentResult(SessionId.from(STUB_SESSION), AgentRunId.from(STUB_RUN), AgentRunStatus.SUSPENDED, "", [
			new PendingCall(ToolCallId.from(callId), tool, args, "destructive"),
		]);
	}

	/** What every question answers until a queued answer says otherwise. */
	public answersWith(result: AgentResult | string): this {
		this.fallback = typeof result === "string" ? AgentStub.completed(result) : result;
		return this;
	}

	/** Queues one answer for the next question, and the one after takes the next. */
	public thenAnswers(result: AgentResult | string): this {
		this.answers.push(typeof result === "string" ? AgentStub.completed(result) : result);
		return this;
	}

	/** What the last question carried besides the words, for a spec asserting on attachments. */
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

	/**
	 * Refuses on purpose: building a real inspection would mean building a journal.
	 *
	 * A test that needs to read where a session stands is testing the runtime, and the bed
	 * is what boots one.
	 */
	public async inspect(): Promise<SessionInspection> {
		throw new Error("no runtime behind this agent: use AdkTestBed when the test needs a session");
	}
}

import {
	type AgentHandle,
	type AgentResult,
	type AskOptions,
	type SessionId,
	type SessionInspection,
	ToolCallId,
} from "@nestjs-adk/core";
import { NothingAwaitingError } from "./errors/nothing-awaiting.error";
import { RecordedRun } from "./recorded-run";
import type { RunRecorder } from "./run-recorder";
import type { ScriptedModel } from "./scripted-model";

/**
 * A test's handle on one agent, over the real container and the real run path.
 *
 * It answers with the run the application would have got, carrying the evidence of what
 * happened along with it: nothing about the runtime is shortcut, and nothing has to be
 * correlated back out of a global recorder afterwards.
 *
 * The session is held between questions, so a follow up continues the conversation that
 * is actually open and a decision reaches the run that is actually waiting.
 */
export class TestAgent {
	private current?: SessionId;

	public constructor(
		private readonly handle: AgentHandle,
		private readonly recorder: RunRecorder,
		/** The script behind this agent, when the test scripted one. */
		public readonly script?: ScriptedModel,
	) {}

	/** The conversation this handle has been talking in, once it has said anything. */
	public get sessionId(): SessionId | undefined {
		return this.current;
	}

	/** The next question opens a new conversation instead of continuing this one. */
	public newSession(): this {
		this.current = undefined;
		return this;
	}

	public async ask(message: string, options?: AskOptions): Promise<RecordedRun> {
		return this.recorded(await this.handle.ask(message, this.continuing(options)));
	}

	/**
	 * Answers yes to a call the run is waiting on, naming the tool rather than the id.
	 *
	 * A run waits on a call id, and finding it is the one piece of bookkeeping every test
	 * used to repeat. Naming the tool picks among several; naming nothing takes the only one.
	 */
	public async approve(tool?: string, approvedBy = "test"): Promise<RecordedRun> {
		return this.recorded(await this.handle.approve(this.sessionOrFail(), await this.pendingCall(tool), approvedBy));
	}

	public async reject(reason = "refused by the test", tool?: string, deniedBy = "test"): Promise<RecordedRun> {
		return this.recorded(await this.handle.reject(this.sessionOrFail(), await this.pendingCall(tool), reason, deniedBy));
	}

	/** Where the conversation stands, which is how a test reads a session it did not keep. */
	public async inspect(): Promise<SessionInspection> {
		return this.handle.inspect(this.sessionOrFail());
	}

	/** The instruction the last turn was sent with, which is where an always skill lands. */
	public lastInstruction(): string {
		return this.script?.requests.at(-1)?.instructions?.text ?? "";
	}

	private continuing(options?: AskOptions): AskOptions {
		return { ...options, sessionId: options?.sessionId ?? this.current };
	}

	private recorded(result: AgentResult): RecordedRun {
		this.current = result.sessionId;
		return new RecordedRun(result, this.recorder.events.forRun(result.runId.value));
	}

	/** The call to decide on, read from the session so a resumed run finds what is still open. */
	private async pendingCall(tool?: string): Promise<ToolCallId> {
		const awaiting = (await this.inspect()).approval.awaiting;
		const wanted = tool === undefined ? awaiting : awaiting.filter((call) => call.toolName === tool);
		const call = wanted.at(0);
		if (call === undefined) {
			throw new NothingAwaitingError(
				tool,
				awaiting.map((pending) => pending.toolName),
			);
		}
		return ToolCallId.from(call.callId.value);
	}

	private sessionOrFail(): SessionId {
		const session = this.current;
		if (session === undefined) throw new Error("this agent has not been asked anything yet");
		return session;
	}
}

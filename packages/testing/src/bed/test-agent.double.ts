import {
	type AgentHandle,
	type AgentResult,
	type AskOptions,
	type ModelChunk,
	type SessionId,
	type SessionInspection,
	ToolCallId,
} from "@nestjs-adk/core";
import { NothingAwaitingError } from "../errors/nothing-awaiting.error";
import type { ScriptedModel } from "../model/scripted-model.double";
import { RecordedRun } from "../recording/recorded-run.value-object";
import type { RunRecorder } from "../recording/run-recorder.service";
import { StreamedRun } from "../recording/streamed-run.value-object";

/**
 * One agent as a test drives it: `ask` and `stream` for a question, `approve` and `reject` for a
 * run waiting on a human, `inspect` for where the session stands.
 *
 * The session is carried from one call to the next until `newSession`, and `approve` and
 * `reject` find the pending call by tool name, so no test has to fish for a call id. `stream`
 * drains the generator and answers a `StreamedRun`.
 */
export class TestAgent {
	private current?: SessionId;

	public constructor(
		private readonly handle: AgentHandle,
		private readonly recorder: RunRecorder,
		public readonly script?: ScriptedModel,
	) {}

	public get sessionId(): SessionId | undefined {
		return this.current;
	}

	public newSession(): this {
		this.current = undefined;
		return this;
	}

	public async ask(message: string, options?: AskOptions): Promise<RecordedRun> {
		return this.recorded(await this.handle.ask(message, this.continuing(options)));
	}

	public async stream(message: string, options?: AskOptions): Promise<StreamedRun> {
		const streaming = this.handle.stream(message, this.continuing(options));
		const chunks: ModelChunk[] = [];
		let next = await streaming.next();
		while (!next.done) {
			chunks.push(next.value);
			next = await streaming.next();
		}
		return new StreamedRun(this.recorded(next.value), chunks);
	}

	public async approve(tool?: string, approvedBy = "test"): Promise<RecordedRun> {
		return this.recorded(await this.handle.approve(this.sessionOrFail(), await this.pendingCall(tool), approvedBy));
	}

	public async reject(reason = "refused by the test", tool?: string, deniedBy = "test"): Promise<RecordedRun> {
		return this.recorded(await this.handle.reject(this.sessionOrFail(), await this.pendingCall(tool), reason, deniedBy));
	}

	public async inspect(): Promise<SessionInspection> {
		return this.handle.inspect(this.sessionOrFail());
	}

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

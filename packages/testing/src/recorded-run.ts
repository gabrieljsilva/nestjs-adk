import { AgentResult, type PendingCall } from "@nestjs-adk/core";
import { NothingAwaitingError } from "./errors/nothing-awaiting.error";
import type { RecordedToolCall } from "./recorded-tool-call";
import type { RunEvents } from "./run-events";

/**
 * What a run answered, with what it did on the way.
 *
 * It is the `AgentResult` production returns, extended rather than replaced: everything a
 * service reads is still here, and the evidence a test needs travels with it instead of
 * having to be correlated back out of a global recorder. The events are this run's alone,
 * so an assertion means this run even in a suite that started several.
 */
export class RecordedRun extends AgentResult {
	public constructor(
		result: AgentResult,
		public readonly events: RunEvents,
	) {
		super(result.sessionId, result.runId, result.status, result.text, result.awaiting);
	}

	public get toolCalls(): readonly RecordedToolCall[] {
		return this.events.toolCalls;
	}

	public get toolsRun(): readonly string[] {
		return this.events.toolsRun;
	}

	/** What the model asked for, which includes anything that stopped in front of a human. */
	public get toolsRequested(): readonly string[] {
		return this.events.toolsRequested;
	}

	public get transfers(): readonly string[] {
		return this.events.transfers;
	}

	public get delegations(): readonly string[] {
		return this.events.delegations;
	}

	public callsTo(tool: string): readonly RecordedToolCall[] {
		return this.events.callsTo(tool);
	}

	/**
	 * The call a suspended run is waiting on, which is what a human answers about.
	 *
	 * Naming the tool picks among several. Waiting on nothing is a failure here rather than
	 * an undefined a test would carry into an unreadable assertion further down.
	 */
	public pendingCall(tool?: string): PendingCall {
		const waiting = tool === undefined ? this.awaiting : this.awaiting.filter((call) => call.toolName === tool);
		const call = waiting.at(0);
		if (call === undefined) {
			throw new NothingAwaitingError(
				tool,
				this.awaiting.map((pending) => pending.toolName),
			);
		}
		return call;
	}
}

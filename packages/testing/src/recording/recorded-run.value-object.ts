import { AgentResult, type PendingCall } from "@nestjs-adk/core";
import { NothingAwaitingError } from "../errors/nothing-awaiting.error";
import type { RecordedToolCall } from "./recorded-tool-call.value-object";
import type { RunEvents } from "./run-events.value-object";

/**
 * The `AgentResult` the application receives, with the run's evidence attached: `toolCalls`,
 * `toolsRun`, `toolsRequested`, `transfers`, `delegations`, `callsTo` and `pendingCall`.
 *
 * Everything here is read from the run's events rather than from a double, so the same
 * assertions hold against a script and against a provider.
 */
export class RecordedRun extends AgentResult {
	public constructor(
		result: AgentResult,
		public readonly events: RunEvents,
	) {
		super(result.sessionId, result.runId, result.status, result.text, result.awaiting, result.cost);
	}

	public get toolCalls(): readonly RecordedToolCall[] {
		return this.events.toolCalls;
	}

	public get toolsRun(): readonly string[] {
		return this.events.toolsRun;
	}

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

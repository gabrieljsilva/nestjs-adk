import type { PublishedEvent } from "@nestjs-adk/core";
import { RecordedToolCall } from "./recorded-tool-call";

const USER_MESSAGE = "session.user-message-received";
const ASSISTANT_MESSAGE = "run.assistant-message-produced";
const TOOL_REQUESTED = "tool.call-requested";
const TOOL_PRODUCED = "tool.result-produced";
const TOOL_APPROVAL_REQUESTED = "tool.approval-requested";
const TOOL_APPROVAL_DENIED = "tool.approval-denied";
const AGENT_TRANSFERRED = "agent.transferred";
const DELEGATION_STARTED = "delegation.started";

/**
 * What the runtime published, as a test can ask questions of it.
 *
 * Every assertion about what a run did reads this rather than the model double, which is
 * the whole point: a scripted run and a run a real provider decided publish the same
 * events, so one vocabulary answers for both. The events arrive through the ordinary
 * consumer port, so this sees exactly what an application watching its own runs sees.
 */
export class RunEvents {
	private readonly received: PublishedEvent[] = [];

	public static of(events: readonly PublishedEvent[]): RunEvents {
		const collected = new RunEvents();
		for (const event of events) collected.record(event);
		return collected;
	}

	public record(event: PublishedEvent): void {
		this.received.push(event);
	}

	public get all(): readonly PublishedEvent[] {
		return this.received;
	}

	public get types(): readonly string[] {
		return this.received.map((event) => event.type);
	}

	public countOf(type: string): number {
		return this.received.filter((event) => event.type === type).length;
	}

	/** Only what this run published, which is how one assertion survives a suite of several runs. */
	public forRun(runId: string): RunEvents {
		return RunEvents.of(this.received.filter((event) => event.correlation.runId.value === runId));
	}

	public forSession(sessionId: string): RunEvents {
		return RunEvents.of(this.received.filter((event) => event.sessionId.value === sessionId));
	}

	/**
	 * Every call the model asked for, paired with what came back.
	 *
	 * A call and its result share a callId, which is what pairs them here. A call still
	 * waiting on a human stays `pending`, and one a human refused is `denied`, so a test can
	 * tell "never asked for" apart from "asked for and stopped".
	 *
	 * A result whose request is not in this window still counts. That is the shape of every
	 * approved call: the model asked in the run that suspended, and the tool answered in the
	 * run that resumed, so requiring both halves would make an approved refund invisible.
	 */
	public get toolCalls(): readonly RecordedToolCall[] {
		const byCallId = new Map<string, RecordedToolCall>();
		const order: string[] = [];
		for (const event of this.received) {
			const callId = this.textIn(event, "callId");
			if (callId === undefined) continue;
			if (event.type === TOOL_REQUESTED) {
				const tool = this.textIn(event, "toolName") ?? "";
				this.remember(byCallId, order, RecordedToolCall.requested(callId, tool, this.recordIn(event, "args")));
				continue;
			}
			if (event.type !== TOOL_PRODUCED && event.type !== TOOL_APPROVAL_DENIED) continue;
			const known = byCallId.get(callId) ?? RecordedToolCall.requested(callId, this.textIn(event, "toolName") ?? "", {});
			this.remember(
				byCallId,
				order,
				event.type === TOOL_PRODUCED
					? known.settledWith(this.recordIn(event, "output"), event.payload.failed === true)
					: known.deniedBecause(this.textIn(event, "reason") ?? ""),
			);
		}
		return order.flatMap((callId) => {
			const call = byCallId.get(callId);
			return call === undefined ? [] : [call];
		});
	}

	private remember(known: Map<string, RecordedToolCall>, order: string[], call: RecordedToolCall): void {
		if (!known.has(call.callId)) order.push(call.callId);
		known.set(call.callId, call);
	}

	public callsTo(tool: string): readonly RecordedToolCall[] {
		return this.toolCalls.filter((call) => call.tool === tool);
	}

	/** The tools that answered, which is what happened, not what the model asked for. */
	public get toolsRun(): readonly string[] {
		return this.toolCalls.filter((call) => call.hasRun).map((call) => call.tool);
	}

	public get toolsRequested(): readonly string[] {
		return this.toolCalls.map((call) => call.tool);
	}

	public ran(tool: string): number {
		return this.toolsRun.filter((name) => name === tool).length;
	}

	public get toolsAwaitingApproval(): readonly string[] {
		return this.namesOf(TOOL_APPROVAL_REQUESTED);
	}

	public denied(tool: string): number {
		return this.callsTo(tool).filter((call) => call.outcome === "denied").length;
	}

	public get transfers(): readonly string[] {
		return this.received.flatMap((event) => (event.type === AGENT_TRANSFERRED ? [this.textIn(event, "to") ?? ""] : []));
	}

	public get delegations(): readonly string[] {
		return this.received.flatMap((event) =>
			event.type === DELEGATION_STARTED ? [this.textIn(event, "toAgent") ?? ""] : [],
		);
	}

	/** Everything the assistant said, in order, for an assertion about the words. */
	public get assistantMessages(): readonly string[] {
		return this.received.flatMap((event) => (event.type === ASSISTANT_MESSAGE ? [this.textIn(event, "text") ?? ""] : []));
	}

	public get userMessages(): readonly string[] {
		return this.received.flatMap((event) => (event.type === USER_MESSAGE ? [this.textIn(event, "text") ?? ""] : []));
	}

	/**
	 * The most tool calls one turn asked for at once.
	 *
	 * A turn is a model answer followed by the calls it requested, so the longest run of
	 * requests with no answer between them is how many the model asked for together.
	 */
	public get largestBatch(): number {
		let largest = 0;
		let current = 0;
		for (const event of this.received) {
			if (event.type === TOOL_REQUESTED) current += 1;
			if (event.type === ASSISTANT_MESSAGE) current = 0;
			largest = Math.max(largest, current);
		}
		return largest;
	}

	public clear(): void {
		this.received.length = 0;
	}

	private namesOf(type: string): readonly string[] {
		return this.received.flatMap((event) => (event.type === type ? [this.textIn(event, "toolName") ?? ""] : []));
	}

	private textIn(event: PublishedEvent, field: string): string | undefined {
		const value = event.payload[field];
		return typeof value === "string" ? value : undefined;
	}

	private recordIn(event: PublishedEvent, field: string): Readonly<Record<string, unknown>> {
		const value = event.payload[field];
		return typeof value === "object" && value !== null ? Object(value) : {};
	}
}

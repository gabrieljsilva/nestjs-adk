import { ToolCallId } from "../../../common/identity/tool-call-id";
import { type ApprovalDecision, PendingCall } from "../../session/pending-call";
import { AgentRunSuspended } from "../catalog/agent-run-suspended";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** The version that started carrying the whole turn rather than one call of it. */
const SCHEMA_VERSION = 2;

const CALLS_FIELD = "calls";

/** Codec for a run that stopped to wait for something outside it, with the turn it stopped on. */
export class AgentRunSuspendedCodec extends SessionEventCodec<AgentRunSuspended> {
	public readonly type = AgentRunSuspended.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public encode(event: AgentRunSuspended): Record<string, unknown> {
		return { reason: event.reason, calls: event.calls.map((call) => this.encodeCall(call)) };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): AgentRunSuspended {
		return new AgentRunSuspended(header, this.readText(payload, "reason"), this.readCalls(payload));
	}

	private encodeCall(call: PendingCall): Record<string, unknown> {
		const encoded: Record<string, unknown> = {
			callId: call.callId.value,
			toolName: call.toolName,
			args: { ...call.args },
		};
		// Absent rather than null: a call nobody had to answer for has no effect, and one
		// nobody has answered yet has no decision.
		if (call.effect !== undefined) encoded.effect = call.effect;
		if (call.decision !== undefined) encoded.decision = call.decision;
		if (call.reason !== undefined) encoded.reason = call.reason;
		return encoded;
	}

	private readCalls(payload: Readonly<Record<string, unknown>>): readonly PendingCall[] {
		const value = payload[CALLS_FIELD];
		if (value === undefined) return [];
		if (!Array.isArray(value)) throw new InvalidEventPayloadError(this.type, CALLS_FIELD, "expected an array.");
		return value.map((entry) => this.decodeCall(entry));
	}

	private decodeCall(entry: unknown): PendingCall {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			throw new InvalidEventPayloadError(this.type, CALLS_FIELD, "expected an array of objects.");
		}
		const call: Record<string, unknown> = { ...entry };
		return new PendingCall(
			ToolCallId.from(this.readText(call, "callId")),
			this.readText(call, "toolName"),
			this.readRecord(call, "args"),
			this.readOptionalText(call, "effect"),
			this.readDecision(call),
			this.readOptionalText(call, "reason"),
		);
	}

	private readDecision(call: Readonly<Record<string, unknown>>): ApprovalDecision | undefined {
		const decision = this.readOptionalText(call, "decision");
		if (decision === undefined) return undefined;
		if (decision !== "granted" && decision !== "denied") {
			throw new InvalidEventPayloadError(this.type, "decision", 'expected "granted" or "denied".');
		}
		return decision;
	}
}

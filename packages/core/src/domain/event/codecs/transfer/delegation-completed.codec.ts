import { AgentRunId } from "../../../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../../../common/identity/correlation-id.value-object";
import { DelegationCompleted } from "../../catalog/transfer/delegation-completed.event";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";

/** Codec for the closing of a delegation, with the outcome the child run reported. */
export class DelegationCompletedCodec extends SessionEventCodec<DelegationCompleted> {
	public readonly type = DelegationCompleted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: DelegationCompleted): Record<string, unknown> {
		return { delegationId: event.delegationId.value, childRunId: event.childRunId.value, outcome: event.outcome };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): DelegationCompleted {
		return new DelegationCompleted(
			header,
			CorrelationId.from(this.readText(payload, "delegationId")),
			AgentRunId.from(this.readText(payload, "childRunId")),
			this.readText(payload, "outcome"),
		);
	}
}

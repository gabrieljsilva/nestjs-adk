import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { AgentName } from "../../agent/agent-name";
import { DelegationStarted } from "../catalog/delegation-started";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** Codec for the opening of a delegation towards a child run. */
export class DelegationStartedCodec extends SessionEventCodec<DelegationStarted> {
	public readonly type = DelegationStarted.TYPE;
	public readonly schemaVersion = EventSchemaVersion.initial();

	public encode(event: DelegationStarted): Record<string, unknown> {
		return { delegationId: event.delegationId.value, childRunId: event.childRunId.value, toAgent: event.toAgent.value };
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): DelegationStarted {
		return new DelegationStarted(
			header,
			CorrelationId.from(this.readText(payload, "delegationId")),
			AgentRunId.from(this.readText(payload, "childRunId")),
			AgentName.from(this.readText(payload, "toAgent")),
		);
	}
}

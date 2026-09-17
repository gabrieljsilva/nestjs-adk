import { AgentId } from "../common/identity/agent-id.value-object";
import { AgentRunId } from "../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../common/identity/correlation-id.value-object";
import { EventId } from "../common/identity/event-id.value-object";
import type { IdGenerator } from "../common/identity/id-generator.contract";
import { SessionId } from "../common/identity/session-id.value-object";
import { ToolCallId } from "../common/identity/tool-call-id.value-object";
import { SequenceIdGenerator } from "./sequence-id-generator.double";

/** Builds typed identities from a generator, so a test never hand writes an id string. */
export class IdentityFactory {
	public constructor(private readonly generator: IdGenerator = new SequenceIdGenerator()) {}

	public sessionId(): SessionId {
		return SessionId.from(this.generator.next());
	}

	public agentRunId(): AgentRunId {
		return AgentRunId.from(this.generator.next());
	}

	public agentId(): AgentId {
		return AgentId.from(this.generator.next());
	}

	public eventId(): EventId {
		return EventId.from(this.generator.next());
	}

	public toolCallId(): ToolCallId {
		return ToolCallId.from(this.generator.next());
	}

	public correlationId(): CorrelationId {
		return CorrelationId.from(this.generator.next());
	}
}

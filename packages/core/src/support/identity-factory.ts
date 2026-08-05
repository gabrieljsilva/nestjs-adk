import { AgentId } from "../common/identity/agent-id";
import { AgentRunId } from "../common/identity/agent-run-id";
import { CorrelationId } from "../common/identity/correlation-id";
import { EventId } from "../common/identity/event-id";
import type { IdGenerator } from "../common/identity/id-generator";
import { SessionId } from "../common/identity/session-id";
import { ToolCallId } from "../common/identity/tool-call-id";
import { SequenceIdGenerator } from "./sequence-id-generator";

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

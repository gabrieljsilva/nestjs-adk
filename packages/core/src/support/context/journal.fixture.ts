import { ContentDigest } from "../../common/digest/content-digest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentRunStarted } from "../../domain/event/catalog/agent-run-started";
import { AssistantMessageProduced } from "../../domain/event/catalog/assistant-message-produced";
import { SkillActivated } from "../../domain/event/catalog/skill-activated";
import { ToolCallRequested } from "../../domain/event/catalog/tool-call-requested";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { UserMessageReceived } from "../../domain/event/catalog/user-message-received";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import type { SessionEvent } from "../../domain/event/session-event";
import { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { ModelIdentity } from "../../domain/model/model-identity";

const START = Instant.fromIso("2026-01-01T00:00:00.000Z");
const MODEL = ModelIdentity.of("google", "gemini-flash");

/**
 * Builds the journal a context test needs, one call per fact.
 *
 * Revisions are handed out in order, so a test states what happened and never the
 * bookkeeping around it. Ids are derived from the position, which keeps two identical
 * scripts byte identical and lets a replay assertion mean something.
 */
export class JournalFixture {
	private readonly stored: StoredSessionEvent[] = [];
	private revision = SessionRevision.initial();

	public constructor(public readonly sessionId: SessionId = SessionId.from("s-1")) {}

	public user(text: string): this {
		return this.append((header) => new UserMessageReceived(header, text));
	}

	public assistant(text: string): this {
		return this.append((header) => new AssistantMessageProduced(header, text, MODEL));
	}

	public toolCall(callId: string, toolName: string, args: Record<string, unknown> = {}): this {
		return this.append((header) => new ToolCallRequested(header, ToolCallId.from(callId), toolName, args));
	}

	public toolResult(callId: string, toolName: string, output: Record<string, unknown> = {}, failed = false): this {
		return this.append((header) => new ToolResultProduced(header, ToolCallId.from(callId), toolName, output, failed));
	}

	public skill(name: string, scope: "run" | "session" = "run", callId = "c-1"): this {
		return this.append(
			(header) =>
				new SkillActivated(header, name, scope, ContentDigest.of("sha256", "skill-body"), ToolCallId.from(callId)),
		);
	}

	/** A fact that is history rather than conversation, used to prove it stays out of the context. */
	public runStarted(agent = "support"): this {
		return this.append((header) => new AgentRunStarted(header, AgentName.from(agent), MODEL));
	}

	public get events(): readonly StoredSessionEvent[] {
		return [...this.stored];
	}

	public get head(): SessionRevision {
		return this.revision;
	}

	public async *stream(afterRevision: SessionRevision = SessionRevision.initial()): AsyncIterable<StoredSessionEvent> {
		for (const event of this.stored) {
			if (event.revision.isAfter(afterRevision)) yield event;
		}
	}

	private append(build: (header: EventHeader) => SessionEvent): this {
		this.revision = this.revision.next();
		const position = this.revision.value;
		const header = new EventHeader(
			EventId.from(`e-${position}`),
			Instant.fromEpochMillis(START.epoch + position),
			new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("agent-1"), CorrelationId.from("corr-1")),
		);
		this.stored.push(new StoredSessionEvent(this.sessionId, this.revision, build(header)));
		return this;
	}
}

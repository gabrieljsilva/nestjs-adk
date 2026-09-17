import { ContentDigest } from "../../common/digest/content-digest.value-object";
import { AgentId } from "../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { EventId } from "../../common/identity/event-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { AgentRunStarted } from "../../domain/event/catalog/run/agent-run-started.event";
import { SkillActivated } from "../../domain/event/catalog/run/skill-activated.event";
import { AssistantMessageProduced } from "../../domain/event/catalog/session/assistant-message-produced.event";
import { UserMessageReceived } from "../../domain/event/catalog/session/user-message-received.event";
import { ToolCallRequested } from "../../domain/event/catalog/tool/tool-call-requested.event";
import { ToolResultProduced } from "../../domain/event/catalog/tool/tool-result-produced.event";
import { EventCorrelation } from "../../domain/event/event-correlation.value-object";
import { EventHeader } from "../../domain/event/event-header.value-object";
import type { SessionEvent } from "../../domain/event/session-event.event";
import { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import type { PromptMeasurement } from "../../domain/model/usage/prompt-measurement.value-object";

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

	public user(text: string, attachments: readonly AttachmentReference[] = []): this {
		return this.append((header) => new UserMessageReceived(header, text, attachments));
	}

	/** The measurement is optional because most providers report one and a test rarely cares. */
	public assistant(text: string, measurement?: PromptMeasurement): this {
		return this.append((header) => new AssistantMessageProduced(header, text, MODEL, measurement));
	}

	public toolCall(callId: string, toolName: string, args: Record<string, unknown> = {}): this {
		return this.append((header) => new ToolCallRequested(header, ToolCallId.from(callId), toolName, args));
	}

	public toolResult(
		callId: string,
		toolName: string,
		output: Record<string, unknown> = {},
		failed = false,
		attachments: readonly AttachmentReference[] = [],
	): this {
		return this.append(
			(header) =>
				new ToolResultProduced(header, ToolCallId.from(callId), toolName, output, failed, undefined, attachments),
		);
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

import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { EventId } from "../../common/identity/event-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { UserMessageReceived } from "./catalog/session/user-message-received.event";
import { EventCorrelation } from "./event-correlation.value-object";
import { EventHeader } from "./event-header.value-object";
import { PublishedEvent } from "./published-event.value-object";
import { StoredSessionEvent } from "./stored-session-event.record";

const SESSION = SessionId.from("s-1");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

const event = new UserMessageReceived(
	new EventHeader(
		EventId.from("e-1"),
		NOW,
		new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
	),
	"hi",
);

describe("PublishedEvent", () => {
	it("carries the type, the correlation and the payload it was given", () => {
		const published = PublishedEvent.durable(new StoredSessionEvent(SESSION, new SessionRevision(1), event), {
			text: "hi",
		});

		expect(published.type).toBe(UserMessageReceived.TYPE);
		expect(published.correlation.runId.value).toBe("run-1");
		expect(published.payload.text).toBe("hi");
		expect(published.schemaVersion).toBe(event.schemaVersion.value);
	});

	it("is durable when it advanced a revision", () => {
		const published = PublishedEvent.durable(new StoredSessionEvent(SESSION, new SessionRevision(3), event), {});

		expect(published.isDurable).toBe(true);
		expect(published.revision?.value).toBe(3);
	});

	it("is not durable when nothing was written, which is the honest difference", () => {
		const published = PublishedEvent.runtime(SESSION, event, {});

		expect(published.isDurable).toBe(false);
		expect(published.revision).toBeUndefined();
	});
});

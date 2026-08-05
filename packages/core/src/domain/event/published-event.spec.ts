import { describe, expect, it } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { UserMessageReceived } from "./catalog/user-message-received";
import { EventCorrelation } from "./event-correlation";
import { EventHeader } from "./event-header";
import { PublishedEvent } from "./published-event";
import { StoredSessionEvent } from "./stored-session-event";

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
		const published = PublishedEvent.durable(new StoredSessionEvent(SESSION, SessionRevision.of(1), event), {
			text: "hi",
		});

		expect(published.type).toBe(UserMessageReceived.TYPE);
		expect(published.correlation.runId.value).toBe("run-1");
		expect(published.payload.text).toBe("hi");
		expect(published.schemaVersion).toBe(event.schemaVersion.value);
	});

	it("is durable when it advanced a revision", () => {
		const published = PublishedEvent.durable(new StoredSessionEvent(SESSION, SessionRevision.of(3), event), {});

		expect(published.isDurable).toBe(true);
		expect(published.revision?.value).toBe(3);
	});

	it("is not durable when nothing was written, which is the honest difference", () => {
		const published = PublishedEvent.runtime(SESSION, event, {});

		expect(published.isDurable).toBe(false);
		expect(published.revision).toBeUndefined();
	});
});

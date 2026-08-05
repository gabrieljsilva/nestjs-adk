import { describe, expect, it } from "vitest";
import { AgentId } from "../common/identity/agent-id";
import { AgentRunId } from "../common/identity/agent-run-id";
import { CorrelationId } from "../common/identity/correlation-id";
import { EventId } from "../common/identity/event-id";
import { SessionId } from "../common/identity/session-id";
import { Instant } from "../common/time/instant";
import { UserMessageReceived } from "../domain/event/catalog/user-message-received";
import { EventCorrelation } from "../domain/event/event-correlation";
import { EventHeader } from "../domain/event/event-header";
import { PublishedEvent } from "../domain/event/published-event";
import { SessionEventConsumer } from "./session-event-consumer";

const published = PublishedEvent.runtime(
	SessionId.from("s-1"),
	new UserMessageReceived(
		new EventHeader(
			EventId.from("e-1"),
			Instant.fromIso("2026-01-01T00:00:00.000Z"),
			new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
		),
		"hi",
	),
	{ text: "hi" },
);

class RecordingConsumer extends SessionEventConsumer {
	public readonly name = "recording";
	public readonly seen: PublishedEvent[] = [];

	public async consume(event: PublishedEvent): Promise<void> {
		this.seen.push(event);
	}
}

describe("SessionEventConsumer", () => {
	it("receives the published event", async () => {
		const consumer = new RecordingConsumer();

		await consumer.consume(published);

		expect(consumer.seen).toHaveLength(1);
	});

	it("declares no flush when it buffers nothing", () => {
		expect(new RecordingConsumer().flush).toBeUndefined();
	});

	it("is the type the runtime depends on", () => {
		expect(new RecordingConsumer()).toBeInstanceOf(SessionEventConsumer);
	});
});

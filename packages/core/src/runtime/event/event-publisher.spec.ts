import { describe, expect, it, vi } from "vitest";
import { AgentId } from "../../common/identity/agent-id";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import { EventId } from "../../common/identity/event-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import { SessionEventConsumer } from "../../contracts/session-event-consumer";
import { ToolCallRequested } from "../../domain/event/catalog/tool-call-requested";
import { UserMessageReceived } from "../../domain/event/catalog/user-message-received";
import type { ConsumerFailed } from "../../domain/event/consumer-failed";
import { EventCorrelation } from "../../domain/event/event-correlation";
import { EventHeader } from "../../domain/event/event-header";
import type { PublishedEvent } from "../../domain/event/published-event";
import type { SessionEvent } from "../../domain/event/session-event";
import { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { EventPublisher } from "./event-publisher";

const SESSION = SessionId.from("s-1");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

function header(id: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
	);
}

function stored(revision: number, event: SessionEvent): StoredSessionEvent {
	return new StoredSessionEvent(SESSION, SessionRevision.of(revision), event);
}

class RecordingConsumer extends SessionEventConsumer {
	public readonly seen: PublishedEvent[] = [];
	public flushed = 0;

	public constructor(public readonly name = "recording") {
		super();
	}

	public async consume(event: PublishedEvent): Promise<void> {
		this.seen.push(event);
	}

	public async flush(): Promise<void> {
		this.flushed += 1;
	}
}

class FailingConsumer extends SessionEventConsumer {
	public readonly name = "failing";

	public async consume(): Promise<void> {
		throw new Error("connection refused");
	}
}

/** Refuses the first event and takes the rest, which is a consumer having a bad moment. */
class HalfFailingConsumer extends SessionEventConsumer {
	public readonly name = "half-failing";
	public readonly seen: string[] = [];

	public async consume(event: PublishedEvent): Promise<void> {
		if (this.seen.length === 0 && event.payload.text === "one") throw new Error("connection refused");
		this.seen.push(String(event.payload.text));
	}
}

class HangingConsumer extends SessionEventConsumer {
	public readonly name = "hanging";

	public async consume(): Promise<void> {
		await new Promise<void>(() => undefined);
	}
}

/** A sink that breaks while being told something broke, which must not reach the run. */
class ThrowingSink extends ConsumerNoticeSink {
	public report(): void {
		throw new Error("the notice sink is down too");
	}
}

class RecordingSink extends ConsumerNoticeSink {
	public readonly notices: ConsumerFailed[] = [];

	public report(notice: ConsumerFailed): void {
		this.notices.push(notice);
	}
}

describe("EventPublisher", () => {
	it("hands every committed event to every consumer", async () => {
		const first = new RecordingConsumer("first");
		const second = new RecordingConsumer("second");
		const publisher = new EventPublisher([first, second]);

		await publisher.publish([
			stored(1, new UserMessageReceived(header("e-1"), "hi")),
			stored(2, new UserMessageReceived(header("e-2"), "again")),
		]);

		expect(first.seen.map((event) => event.payload.text)).toEqual(["hi", "again"]);
		expect(second.seen).toHaveLength(2);
	});

	it("publishes nothing when the append produced nothing", async () => {
		const consumer = new RecordingConsumer();

		await new EventPublisher([consumer]).publish([]);

		expect(consumer.seen).toHaveLength(0);
	});

	it("marks a committed event as durable, with the revision it landed on", async () => {
		const consumer = new RecordingConsumer();

		await new EventPublisher([consumer]).publish([stored(7, new UserMessageReceived(header("e-1"), "hi"))]);

		expect(consumer.seen[0]?.isDurable).toBe(true);
		expect(consumer.seen[0]?.revision?.value).toBe(7);
	});

	it("marks an emitted event as not durable, because nothing was written", async () => {
		const consumer = new RecordingConsumer();

		await new EventPublisher([consumer]).emit(SESSION, new UserMessageReceived(header("e-1"), "hi"));

		expect(consumer.seen[0]?.isDurable).toBe(false);
	});

	it("redacts a credential a tool call carried before any consumer sees it", async () => {
		const consumer = new RecordingConsumer();
		const call = new ToolCallRequested(header("e-1"), ToolCallId.from("c-1"), "refund", {
			orderId: "42",
			apiKey: "sk-live",
		});

		await new EventPublisher([consumer]).publish([stored(1, call)]);

		expect(consumer.seen[0]?.payload).toMatchObject({ args: { orderId: "42", apiKey: "[redacted]" } });
	});

	it("isolates a consumer that throws, and still delivers to the others", async () => {
		const healthy = new RecordingConsumer();
		const sink = new RecordingSink();

		await new EventPublisher([new FailingConsumer(), healthy], sink).publish([
			stored(1, new UserMessageReceived(header("e-1"), "hi")),
		]);

		expect(healthy.seen).toHaveLength(1);
		expect(sink.notices[0]?.consumer).toBe("failing");
		expect(sink.notices[0]?.timedOut).toBe(false);
	});

	it("isolates a consumer that never returns, once its time is up", async () => {
		vi.useFakeTimers();
		const healthy = new RecordingConsumer();
		const sink = new RecordingSink();
		const publisher = new EventPublisher([new HangingConsumer(), healthy], sink, 5000);

		const published = publisher.publish([stored(1, new UserMessageReceived(header("e-1"), "hi"))]);
		await vi.advanceTimersByTimeAsync(5000);
		await published;
		vi.useRealTimers();

		expect(healthy.seen).toHaveLength(1);
		expect(sink.notices[0]?.timedOut).toBe(true);
		expect(sink.notices[0]?.reason).toContain("5000");
	});

	it("flushes every consumer that buffers, and none that does not", async () => {
		const consumer = new RecordingConsumer();

		await new EventPublisher([consumer, new FailingConsumer()]).flush();

		expect(consumer.flushed).toBe(1);
	});

	it("reports a flush that failed rather than letting shutdown fail", async () => {
		const sink = new RecordingSink();
		const failing = new RecordingConsumer("buffering");
		failing.flush = async () => {
			throw new Error("disk full");
		};

		await expect(new EventPublisher([failing], sink).flush()).resolves.toBeUndefined();
		expect(sink.notices[0]?.eventType).toBe("flush");
	});

	it("does nothing at all when nobody is watching", async () => {
		const publisher = new EventPublisher();

		await expect(publisher.publish([stored(1, new UserMessageReceived(header("e-1"), "hi"))])).resolves.toBeUndefined();
		expect(publisher.hasConsumers).toBe(false);
	});

	it("spends one timeout on a hanging consumer, whatever the size of the batch", async () => {
		vi.useFakeTimers();
		const sink = new RecordingSink();
		const publisher = new EventPublisher([new HangingConsumer()], sink, 1000);

		const publishing = publisher.publish([
			stored(1, new UserMessageReceived(header("e-1"), "one")),
			stored(2, new UserMessageReceived(header("e-2"), "two")),
			stored(3, new UserMessageReceived(header("e-3"), "three")),
		]);
		await vi.advanceTimersByTimeAsync(1000);
		await publishing;
		vi.useRealTimers();

		expect(sink.notices).toHaveLength(1);
		expect(sink.notices[0]?.timedOut).toBe(true);
	});

	it("keeps delivering the batch to a consumer that failed on one event of it", async () => {
		const consumer = new HalfFailingConsumer();
		const publisher = new EventPublisher([consumer], new RecordingSink());

		await publisher.publish([
			stored(1, new UserMessageReceived(header("e-1"), "one")),
			stored(2, new UserMessageReceived(header("e-2"), "two")),
		]);

		expect(consumer.seen).toEqual(["two"]);
	});

	it("swallows a notice sink that throws, so telemetry cannot break a committed run", async () => {
		const publisher = new EventPublisher([new FailingConsumer()], new ThrowingSink());

		await expect(publisher.publish([stored(1, new UserMessageReceived(header("e-1"), "hi"))])).resolves.toBeUndefined();
	});
});

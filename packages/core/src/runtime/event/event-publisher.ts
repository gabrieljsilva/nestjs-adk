import type { SessionId } from "../../common/identity/session-id";
import type { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import type { SessionEventConsumer } from "../../contracts/session-event-consumer";
import { SessionEventPublisher } from "../../contracts/session-event-publisher";
import { ConsumerFailed } from "../../domain/event/consumer-failed";
import { PublishedEvent } from "../../domain/event/published-event";
import type { SessionEvent } from "../../domain/event/session-event";
import { SessionEventCodecs } from "../../domain/event/session-event-codecs";
import type { SessionEventRegistry } from "../../domain/event/session-event-registry";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event";
import { ConsumerTimeoutError } from "./errors/consumer-timeout.error";
import { EventRedactor } from "./event-redactor";
import { NoOpConsumerNoticeSink } from "./no-op-consumer-notice-sink";

/** Long enough for an exporter over a network, short enough that a hang is not a stall. */
const DEFAULT_CONSUMER_TIMEOUT_MS = 5000;

/** What a timeout is reported against, because it belongs to the batch rather than to one event. */
const BATCH = "batch";

/**
 * Fans committed events out to whoever is watching, after the fact and never before it.
 *
 * Only what the storage confirmed reaches a consumer, because this is called with the
 * committed envelopes and with nothing else: an append that failed produces no envelopes
 * and therefore no publication, and there is no code path here that could invent one.
 *
 * Consumers are isolated from each other and from the run. One that throws and one that
 * never returns are both dropped after a notice, and neither delays the others: they are
 * dispatched together rather than in a line, so a slow exporter costs its own timeout and
 * not everyone else's.
 */
export class EventPublisher extends SessionEventPublisher {
	private readonly consumers: readonly SessionEventConsumer[];

	public constructor(
		consumers: readonly SessionEventConsumer[] = [],
		private readonly notices: ConsumerNoticeSink = new NoOpConsumerNoticeSink(),
		private readonly timeoutMs: number = DEFAULT_CONSUMER_TIMEOUT_MS,
		private readonly codecs: SessionEventRegistry = SessionEventCodecs.registry(),
		private readonly redactor: EventRedactor = new EventRedactor(),
	) {
		super();
		this.consumers = [...consumers];
	}

	public get hasConsumers(): boolean {
		return this.consumers.length > 0;
	}

	/** One event at a time, so every consumer sees a batch in the order the journal recorded it. */
	public async publish(committed: readonly StoredSessionEvent[]): Promise<void> {
		if (!this.hasConsumers) return;
		await this.deliver(committed.map((stored) => PublishedEvent.durable(stored, this.payloadOf(stored.event))));
	}

	/** A fact that never reached the journal, and never will: a chunk, a notice, a progress step. */
	public async emit(sessionId: SessionId, event: SessionEvent): Promise<void> {
		if (!this.hasConsumers) return;
		await this.deliver([PublishedEvent.runtime(sessionId, event, this.payloadOf(event))]);
	}

	/**
	 * Empties whatever the consumers were holding on purpose.
	 * Shutdown is the last moment a batch can still leave, so this runs before dispose
	 * and, like everything else here, lets one consumer fail without stopping the rest.
	 */
	public async flush(): Promise<void> {
		await Promise.all(this.consumers.map((consumer) => this.flushOne(consumer)));
	}

	private async deliver(events: readonly PublishedEvent[]): Promise<void> {
		if (events.length === 0) return;
		await Promise.all(this.consumers.map((consumer) => this.consume(consumer, events)));
	}

	/**
	 * One deadline for the whole batch, not one per event.
	 *
	 * A consumer that hangs costs its timeout once. Timing each event apart would multiply
	 * that by the size of the batch, and a commit of ten events would hold the run for ten
	 * timeouts before anybody found out the exporter was gone.
	 */
	private async consume(consumer: SessionEventConsumer, events: readonly PublishedEvent[]): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				this.deliverInOrder(consumer, events),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new ConsumerTimeoutError(consumer.name, this.timeoutMs)), this.timeoutMs);
				}),
			]);
		} catch (error) {
			this.report(consumer, BATCH, error);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	/** In order, and one event that fails does not cost the consumer the rest of the batch. */
	private async deliverInOrder(consumer: SessionEventConsumer, events: readonly PublishedEvent[]): Promise<void> {
		for (const event of events) {
			try {
				await consumer.consume(event);
			} catch (error) {
				this.report(consumer, event.type, error);
			}
		}
	}

	private async flushOne(consumer: SessionEventConsumer): Promise<void> {
		if (consumer.flush === undefined) return;
		try {
			await consumer.flush();
		} catch (error) {
			this.report(consumer, "flush", error);
		}
	}

	/**
	 * A sink that throws while being told about a failure would take the failure with it,
	 * out through the publisher and into a commit the journal has already accepted.
	 */
	private report(consumer: SessionEventConsumer, eventType: string, error: unknown): void {
		const reason = error instanceof Error ? error.message : String(error);
		const timedOut = error instanceof ConsumerTimeoutError;
		try {
			this.notices.report(new ConsumerFailed(consumer.name, eventType, reason, timedOut));
		} catch {
			return;
		}
	}

	private payloadOf(event: SessionEvent): Readonly<Record<string, unknown>> {
		return this.redactor.redact(this.codecs.codecFor(event.type).encode(event));
	}
}

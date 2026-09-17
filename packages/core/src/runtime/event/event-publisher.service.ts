import type { ConsumerFailureSink } from "../../contracts/events/consumer-failure-sink.contract";
import type { SessionEventConsumer } from "../../contracts/events/session-event-consumer.contract";
import { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import { PublishedEvent } from "../../domain/event/published-event.value-object";
import { SessionEventCodecs } from "../../domain/event/session-event-codecs.factory";
import type { SessionEventRegistry } from "../../domain/event/session-event-registry.service";
import type { SessionEvent } from "../../domain/event/session-event.event";
import type { StoredSessionEvent } from "../../domain/event/stored-session-event.record";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ConsumerTimeoutError } from "./errors/consumer-timeout.error";
import type { EventRedactor } from "./event-redactor.contract";
import { FieldNameEventRedactor } from "./field-name-event-redactor.adapter";
import { NoOpConsumerFailureSink } from "./no-op-consumer-failure-sink.adapter";
import { SessionEventPublisher } from "./session-event-publisher.contract";

const DEFAULT_CONSUMER_TIMEOUT_MS = 5000;

const BATCH = "batch";

export class EventPublisher extends SessionEventPublisher {
	private readonly consumers: readonly SessionEventConsumer[];

	public constructor(
		consumers: readonly SessionEventConsumer[] = [],
		private readonly notices: ConsumerFailureSink = new NoOpConsumerFailureSink(),
		private readonly timeoutMs: number = DEFAULT_CONSUMER_TIMEOUT_MS,
		private readonly codecs: SessionEventRegistry = SessionEventCodecs.registry(),
		private readonly redactor: EventRedactor = new FieldNameEventRedactor(),
	) {
		super();
		this.consumers = [...consumers];
	}

	public get hasConsumers(): boolean {
		return this.consumers.length > 0;
	}

	public async publish(context: SessionContext, committed: readonly StoredSessionEvent[]): Promise<void> {
		if (!this.hasConsumers) return;
		const events = committed.map((stored) => PublishedEvent.durable(stored, this.buildPayload(stored.event)));
		await this.deliver(context, events);
	}

	public async emit(context: SessionContext, event: SessionEvent): Promise<void> {
		if (!this.hasConsumers) return;
		await this.deliver(context, [PublishedEvent.runtime(context.sessionId, event, this.buildPayload(event))]);
	}

	public async flush(): Promise<void> {
		await Promise.all(this.consumers.map((consumer) => this.flushOne(consumer)));
	}

	private async deliver(context: SessionContext, events: readonly PublishedEvent[]): Promise<void> {
		if (events.length === 0) return;
		await Promise.all(this.consumers.map((consumer) => this.consume(context, consumer, events)));
	}

	private async consume(
		context: SessionContext,
		consumer: SessionEventConsumer,
		events: readonly PublishedEvent[],
	): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				this.deliverInOrder(context, consumer, events),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new ConsumerTimeoutError(consumer.name, this.timeoutMs)), this.timeoutMs);
				}),
			]);
		} catch (error) {
			this.report(context, consumer, BATCH, error);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	private async deliverInOrder(
		context: SessionContext,
		consumer: SessionEventConsumer,
		events: readonly PublishedEvent[],
	): Promise<void> {
		for (const event of events) {
			try {
				await consumer.consume(context, event);
			} catch (error) {
				this.report(context, consumer, event.type, error);
			}
		}
	}

	private async flushOne(consumer: SessionEventConsumer): Promise<void> {
		if (consumer.flush === undefined) return;
		try {
			await consumer.flush();
		} catch (error) {
			this.report(undefined, consumer, "flush", error);
		}
	}

	private report(
		context: SessionContext | undefined,
		consumer: SessionEventConsumer,
		eventType: string,
		error: unknown,
	): void {
		const reason = error instanceof Error ? error.message : String(error);
		const timedOut = error instanceof ConsumerTimeoutError;
		try {
			this.notices.report(context, new ConsumerFailed(consumer.name, eventType, reason, timedOut));
		} catch {
			return;
		}
	}

	private buildPayload(event: SessionEvent): Readonly<Record<string, unknown>> {
		return this.redactor.redact(this.codecs.findCodecOrFail(event.type).encode(event));
	}
}

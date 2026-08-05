import type { PublishedEvent } from "../domain/event/published-event";

/**
 * Something that watches what a session did: telemetry, audit, evaluation.
 *
 * A consumer is never on the path of a decision. It runs after the commit, its failure
 * changes nothing about the run, and it is isolated from the other consumers, so a slow
 * exporter does not hold up an audit trail.
 *
 * `flush` exists because shutdown is the one moment when work buffered on purpose has
 * to leave: implement it when the consumer batches, and leave it out when it does not.
 */
export abstract class SessionEventConsumer {
	/** How this consumer is named in a notice, which is the only place it appears. */
	public abstract readonly name: string;

	public abstract consume(event: PublishedEvent): Promise<void>;

	public flush?(): Promise<void>;
}

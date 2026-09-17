import type { PublishedEvent } from "../../domain/event/published-event";
import type { SessionContext } from "../../domain/run/session-context";

/**
 * Something that watches what a session did: telemetry, audit, evaluation.
 *
 * A consumer is never on the path of a decision. It runs after the commit, its failure
 * changes nothing about the run, and it is isolated from the other consumers, so a slow
 * exporter does not hold up an audit trail.
 *
 * `flush` exists because shutdown is the one moment when work buffered on purpose has
 * to leave: implement it when the consumer batches, and leave it out when it does not.
 *
 * It is given a `SessionContext` and not a `RunContext`: publication happens after the
 * commit, from a publisher that outlives every run and batches across sessions, so the run
 * that wrote the event is already over by the time a consumer reads it. The conversation
 * and its metadata are the part that is still true.
 */
export abstract class SessionEventConsumer {
	/** How this consumer is named in a notice, which is the only place it appears. */
	public abstract readonly name: string;

	public abstract consume(context: SessionContext, event: PublishedEvent): Promise<void>;

	public flush?(): Promise<void>;
}

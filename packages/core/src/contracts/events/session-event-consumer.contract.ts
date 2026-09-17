import type { PublishedEvent } from "../../domain/event/published-event.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Something that watches what a session did: telemetry, audit, evaluation.
 *
 * A consumer runs after the commit, its failure changes nothing about the run, and it is
 * isolated from the other consumers. Implement `flush` when it batches: shutdown is the one
 * moment when work buffered on purpose has to leave.
 */
export abstract class SessionEventConsumer {
	public abstract readonly name: string;

	public abstract consume(context: SessionContext, event: PublishedEvent): Promise<void>;

	public flush?(): Promise<void>;
}

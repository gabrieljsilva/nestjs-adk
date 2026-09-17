import { type PublishedEvent, type SessionContext, SessionEventConsumer } from "@nestjs-adk/core";
import { RunEvents } from "./run-events.value-object";

/**
 * The consumer that collects the events the bed asserts on. The bed installs one; declare it
 * yourself only when the events are wanted outside a bed.
 */
export class RunRecorder extends SessionEventConsumer {
	public readonly name = "run-recorder";

	public readonly events = new RunEvents();

	public async consume(_context: SessionContext, event: PublishedEvent): Promise<void> {
		this.events.record(event);
	}
}

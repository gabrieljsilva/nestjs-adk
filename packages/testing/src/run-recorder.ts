import { type PublishedEvent, SessionEventConsumer } from "@nestjs-adk/core";
import { RunEvents } from "./run-events";

/**
 * The consumer the test bed always plugs in, and the only thing that watches every run.
 *
 * It records and never decides, which is what a consumer is: it runs after the commit and
 * a failure here changes nothing about the run. Because it observes the runtime rather
 * than the model, a run a use case started is recorded just as fully as one the test asked
 * for itself.
 */
export class RunRecorder extends SessionEventConsumer {
	public readonly name = "run-recorder";

	public readonly events = new RunEvents();

	public async consume(event: PublishedEvent): Promise<void> {
		this.events.record(event);
	}
}

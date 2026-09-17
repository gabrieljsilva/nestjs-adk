import { ConsumerFailureSink } from "../../contracts/events/consumer-failure-sink.contract";
import type { ConsumerFailed } from "../../domain/event/consumer-failed.notice";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/** The default: a consumer is isolated whether or not anyone asked to hear about it. */
export class NoOpConsumerFailureSink extends ConsumerFailureSink {
	public report(_context: SessionContext | undefined, _notice: ConsumerFailed): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

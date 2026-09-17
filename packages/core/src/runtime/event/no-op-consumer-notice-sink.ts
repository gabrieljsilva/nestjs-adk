import { ConsumerNoticeSink } from "../../contracts/events/consumer-notice-sink";
import type { ConsumerFailed } from "../../domain/event/consumer-failed";
import type { SessionContext } from "../../domain/run/session-context";

/** The default: a consumer is isolated whether or not anyone asked to hear about it. */
export class NoOpConsumerNoticeSink extends ConsumerNoticeSink {
	public report(_context: SessionContext | undefined, _notice: ConsumerFailed): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

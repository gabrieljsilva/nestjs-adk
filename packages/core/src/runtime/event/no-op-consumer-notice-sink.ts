import { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import type { ConsumerFailed } from "../../domain/event/consumer-failed";

/** The default: a consumer is isolated whether or not anyone asked to hear about it. */
export class NoOpConsumerNoticeSink extends ConsumerNoticeSink {
	public report(_notice: ConsumerFailed): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

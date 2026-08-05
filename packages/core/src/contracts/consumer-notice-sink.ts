import type { ConsumerFailed } from "../domain/event/consumer-failed";

/**
 * Where the fact that a consumer did not handle an event goes.
 *
 * It exists so that isolating a consumer is not the same as hiding it: the run carries
 * on either way, but somebody gets to know. Like every sink, it is off the path of a
 * decision, and nothing it does changes what the runtime does next.
 */
export abstract class ConsumerNoticeSink {
	public abstract report(notice: ConsumerFailed): void;
}

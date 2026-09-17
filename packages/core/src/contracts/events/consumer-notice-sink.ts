import type { ConsumerFailed } from "../../domain/event/consumer-failed";
import type { SessionContext } from "../../domain/run/session-context";

/**
 * Where the fact that a consumer did not handle an event goes.
 *
 * It exists so that isolating a consumer is not the same as hiding it: the run carries
 * on either way, but somebody gets to know. Like every sink, it is off the path of a
 * decision, and nothing it does changes what the runtime does next.
 *
 * The context is the conversation whose events the consumer was being told about. It is the
 * one port here whose context can be absent, and there is exactly one case: a consumer that
 * fails while being flushed at shutdown was holding a batch it never said which sessions
 * came from, so naming one would be inventing it.
 */
export abstract class ConsumerNoticeSink {
	public abstract report(context: SessionContext | undefined, notice: ConsumerFailed): void;
}

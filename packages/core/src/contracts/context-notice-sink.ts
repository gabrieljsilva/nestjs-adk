import type { ContextWindowUnknown } from "../domain/context/context-window-unknown";

/**
 * Where a context notice goes.
 *
 * Notices describe degraded, not broken: implement it to send them to a logger or to
 * telemetry. A sink is never on the path of a decision, so nothing it does, including
 * failing, changes what the runtime does next.
 */
export abstract class ContextNoticeSink {
	public abstract report(notice: ContextWindowUnknown): void;
}

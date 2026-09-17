import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Where a notice goes: one fact reported to whoever is listening, and never a decision.
 *
 * A notice describes degraded, not broken. Nothing a sink does, including throwing, changes
 * what the runtime does next. The context is the conversation the fact belongs to, and each
 * sink names the case where it is absent.
 */
export abstract class NoticeSink<TNotice> {
	public abstract report(context: SessionContext | undefined, notice: TNotice): void;
}

import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Where a notice goes: one fact reported to whoever is listening, and never a decision.
 *
 * A notice describes degraded, not broken. Implement a sink to send them to a logger or to
 * telemetry. A sink is never on the path of a decision, so nothing it does, including
 * throwing, changes what the runtime does next. That is the property the three sinks share,
 * and it is why they are one family: a reader who has learned one has learned all of them.
 *
 * The context is the conversation the fact belongs to. It can be absent, and each sink's
 * own documentation names the case where it is: a fact produced outside any conversation
 * has none to name, and naming one would be inventing it.
 */
export abstract class NoticeSink<TNotice> {
	public abstract report(context: SessionContext | undefined, notice: TNotice): void;
}

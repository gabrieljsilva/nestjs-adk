import { type ContextNotice, ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/** The default: notices are produced whether or not anyone is listening for them. */
export class NoOpContextNoticeSink extends ContextNoticeSink {
	public report(_context: SessionContext | undefined, _notice: ContextNotice): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

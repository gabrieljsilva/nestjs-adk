import { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown";
import type { SessionContext } from "../../domain/run/session-context";

/** The default: notices are produced whether or not anyone is listening for them. */
export class NoOpContextNoticeSink extends ContextNoticeSink {
	public report(_context: SessionContext, _notice: ContextWindowUnknown): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

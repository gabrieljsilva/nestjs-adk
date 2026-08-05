import { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { ContextWindowUnknown } from "../../domain/context/context-window-unknown";

/** The default: notices are produced whether or not anyone is listening for them. */
export class NoOpContextNoticeSink extends ContextNoticeSink {
	public report(_notice: ContextWindowUnknown): void {
		// nobody is listening yet, and the runtime does not need anyone to be
	}
}

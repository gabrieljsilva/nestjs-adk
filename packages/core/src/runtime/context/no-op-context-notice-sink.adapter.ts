import { type ContextNotice, ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import type { SessionContext } from "../../domain/run/session-context.value-object";

export class NoOpContextNoticeSink extends ContextNoticeSink {
	public report(_context: SessionContext | undefined, _notice: ContextNotice): void {}
}

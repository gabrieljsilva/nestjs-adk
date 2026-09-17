import type { RunContext } from "../../domain/run/run-context.value-object";
import type { ToolCallNotice } from "../../domain/tool/notice/tool-call.notice";
import type { ToolResultNotice } from "../../domain/tool/notice/tool-result.notice";

/**
 * Who is told about the tool calls of one run, as they happen. Nothing here is journaled,
 * replayed or delivered elsewhere.
 *
 * `requested` is awaited before anything of the turn runs; `settled` follows each result as it
 * is produced. Whatever an observer throws ends the run. A delegated run tells its parent's
 * observer nothing.
 */
export abstract class ToolCallObserver {
	public abstract requested(context: RunContext, call: ToolCallNotice): Promise<void> | void;
	public abstract settled(context: RunContext, result: ToolResultNotice): Promise<void> | void;
}

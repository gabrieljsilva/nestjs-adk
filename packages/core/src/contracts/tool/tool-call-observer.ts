import type { RunContext } from "../../domain/run/run-context";
import type { ToolCallNotice } from "../../domain/tool/notice/tool-call-notice";
import type { ToolResultNotice } from "../../domain/tool/notice/tool-result-notice";

/**
 * Who is told about the tool calls of one run, as they happen.
 *
 * Both notices are runtime events and never durable ones: nothing here is journaled,
 * replayed or delivered to another process. What survives is the journal, and a
 * `SessionEventConsumer` is how something outside the run reads that. This is the other
 * side: the code that asked the question, watching the run it asked for, with the tool
 * definition and the gate's verdict in hand rather than a payload to re-type.
 *
 * `requested` is awaited before anything of the turn runs, so an observer that writes a
 * row for the call has written it by the time the result arrives. `settled` follows each
 * result as it is produced; reads that overlap settle in the order they finish. A held
 * call is requested once, in the run that suspended, and settles in the run that released
 * it. Whatever an observer throws ends the run the way any other failure does, because it
 * is the caller's own code running inside the caller's own run.
 *
 * A delegated run tells its parent's observer nothing, the way its chunks reach nobody: the
 * parent asked a question and is owed an answer, not the working out.
 */
export abstract class ToolCallObserver {
	public abstract requested(context: RunContext, call: ToolCallNotice): Promise<void> | void;
	public abstract settled(context: RunContext, result: ToolResultNotice): Promise<void> | void;
}

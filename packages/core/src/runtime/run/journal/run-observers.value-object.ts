import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ContextCapture } from "../../diagnostics/context-capture.contract";
import type { ChunkSink } from "../../stream/chunk-sink.contract";

/**
 * Who is watching a run, if anybody is.
 *
 * All three are absent by default and none changes what the run does: the same journal,
 * the same answer, the same events. They travel together because they are the same kind
 * of thing, and one value keeps three more parameters off every signature the run passes
 * through.
 *
 * The verbs build one on top of another, because a caller usually wants two at once: a
 * streamed answer with its tool calls watched is `streaming(sink).watchingTools(observer)`.
 */
export class RunObservers {
	private constructor(
		public readonly chunks?: ChunkSink,
		public readonly context?: ContextCapture,
		public readonly tools?: ToolCallObserver,
	) {}

	public static none(): RunObservers {
		return new RunObservers();
	}

	public static streaming(chunks: ChunkSink): RunObservers {
		return new RunObservers(chunks);
	}

	public static capturing(context: ContextCapture): RunObservers {
		return new RunObservers(undefined, context);
	}

	public static watchingTools(tools: ToolCallObserver): RunObservers {
		return new RunObservers(undefined, undefined, tools);
	}

	/** The same watchers plus this one; nothing to add hands the same value back. */
	public watchingTools(tools?: ToolCallObserver): RunObservers {
		if (tools === undefined) return this;
		return new RunObservers(this.chunks, this.context, tools);
	}

	public get isWatched(): boolean {
		return this.chunks !== undefined || this.context !== undefined || this.tools !== undefined;
	}
}

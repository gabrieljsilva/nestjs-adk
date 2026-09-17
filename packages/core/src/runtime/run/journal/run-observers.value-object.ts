import type { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import type { ContextCapture } from "../../diagnostics/context-capture.contract";
import type { ChunkSink } from "../../stream/chunk-sink.contract";

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

	public watchingTools(tools?: ToolCallObserver): RunObservers {
		if (tools === undefined) return this;
		return new RunObservers(this.chunks, this.context, tools);
	}

	public get isWatched(): boolean {
		return this.chunks !== undefined || this.context !== undefined || this.tools !== undefined;
	}
}

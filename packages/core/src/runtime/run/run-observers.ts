import type { ContextCapture } from "../diagnostics/context-capture";
import type { ChunkSink } from "../stream/chunk-sink";

/**
 * Who is watching a run, if anybody is.
 *
 * Both are absent by default and neither changes what the run does: the same journal, the
 * same answer, the same events. They travel together because they are the same kind of
 * thing, and one value keeps a fifth parameter off every signature the run passes through.
 */
export class RunObservers {
	private constructor(
		public readonly chunks?: ChunkSink,
		public readonly context?: ContextCapture,
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

	public get isWatched(): boolean {
		return this.chunks !== undefined || this.context !== undefined;
	}
}

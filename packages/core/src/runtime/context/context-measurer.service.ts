import type { ContextProjection } from "../../domain/context/context-projection.value-object";

/**
 * Measures how large a projection is, in characters of the text it will send.
 *
 * It never asks the model. Providers count tokens after a call, not before one, and an
 * adapter that answers a count beforehand is estimating; this measures the one thing
 * that can be known for certain at this point, which is size in characters. The absolute
 * size of a call arrives later, with its usage, and the two together are what carry a
 * past measurement forward to the prompt as it stands now.
 *
 * Measurement is synchronous on purpose: a compaction loop that had to await a provider
 * per removed block would be slow enough that nobody would run it often.
 */
export class ContextMeasurer {
	public measure(projection: ContextProjection): number {
		return this.measurePrefix(projection) + this.measureBlocks(projection);
	}

	private measurePrefix(projection: ContextProjection): number {
		const runtime = projection.runtimeInstructions?.text.length ?? 0;
		const prompt = projection.agentPrompt?.text.length ?? 0;
		return runtime + prompt + this.measureTools(projection);
	}

	private measureTools(projection: ContextProjection): number {
		return projection.tools.reduce(
			(total, tool) => total + tool.name.length + tool.description.length + JSON.stringify(tool.parameters ?? {}).length,
			0,
		);
	}

	private measureBlocks(projection: ContextProjection): number {
		return projection.blocks.reduce(
			(total, block) => total + block.messages.reduce((sum, message) => sum + message.characters, 0),
			0,
		);
	}
}

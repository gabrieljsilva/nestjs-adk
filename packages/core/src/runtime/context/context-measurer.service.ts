import type { ContextProjection } from "../../domain/context/context-projection.value-object";

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

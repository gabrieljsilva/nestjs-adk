import { ContextCategory } from "../../domain/context/context-category";
import { ContextComposition } from "../../domain/context/context-composition";
import type { ContextProjection } from "../../domain/context/context-projection";

/**
 * Measures what a projection is made of, in characters of the text it will send.
 *
 * It never asks the model. Providers count tokens after a call, not before one, and an
 * adapter that answers a count beforehand is estimating; this measures the one thing
 * that can be known for certain at this point, which is size in characters, and reports
 * it as proportion. The absolute size of a call arrives later, with its usage.
 *
 * Measurement is synchronous on purpose: a compaction loop that had to await a provider
 * per removed block would be slow enough that nobody would run it often.
 */
export class ContextMeasurer {
	public measure(projection: ContextProjection): ContextComposition {
		const sizes: Array<readonly [ContextCategory, number]> = [];

		const runtime = projection.runtimeInstructions;
		if (runtime !== undefined) sizes.push([ContextCategory.RUNTIME_INSTRUCTIONS, runtime.text.length]);

		const prompt = projection.agentPrompt;
		if (prompt !== undefined) sizes.push([ContextCategory.AGENT_PROMPT, prompt.text.length]);

		if (projection.tools.length > 0) {
			const characters = projection.tools.reduce(
				(total, tool) => total + tool.name.length + tool.description.length + JSON.stringify(tool.parameters ?? {}).length,
				0,
			);
			sizes.push([ContextCategory.TOOL_DESCRIPTIONS, characters]);
		}

		for (const category of ContextCategory.all()) {
			const characters = projection.blocks
				.filter((block) => block.category.equals(category))
				.reduce((total, block) => total + block.messages.reduce((sum, message) => sum + message.characters, 0), 0);
			if (characters === 0) continue;
			sizes.push([category, characters]);
		}

		return ContextComposition.of(sizes);
	}
}

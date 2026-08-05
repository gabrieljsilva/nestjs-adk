import { SessionRevision } from "../../common/revision/session-revision";
import type { ModelMessage } from "../model/model-message";
import { ModelRequest } from "../model/model-request";
import type { ToolDeclaration } from "../model/tool-declaration";
import type { PromptInstructions } from "../prompt/prompt-instructions";
import type { ContextBlock } from "./context-block";
import { MediaSplitter } from "./media-splitter";

/**
 * What the model is about to read, as blocks instead of a flat list of messages.
 *
 * Instructions and tool declarations are kept apart from the conversation so each one
 * can be measured on its own. Every change returns a new projection: compaction
 * produces another projection rather than editing this one, which is what lets a
 * prepared context stay comparable to the one measured before it.
 */
export class ContextProjection {
	private constructor(
		public readonly blocks: readonly ContextBlock[],
		public readonly tools: readonly ToolDeclaration[],
		public readonly runtimeInstructions?: PromptInstructions,
		public readonly agentPrompt?: PromptInstructions,
	) {}

	public static of(
		blocks: readonly ContextBlock[],
		tools: readonly ToolDeclaration[] = [],
		runtimeInstructions?: PromptInstructions,
		agentPrompt?: PromptInstructions,
	): ContextProjection {
		return new ContextProjection([...blocks], [...tools], runtimeInstructions, agentPrompt);
	}

	public withBlocks(blocks: readonly ContextBlock[]): ContextProjection {
		return new ContextProjection([...blocks], this.tools, this.runtimeInstructions, this.agentPrompt);
	}

	public get messages(): readonly ModelMessage[] {
		return this.blocks.flatMap((block) => block.messages);
	}

	public get openBlocks(): readonly ContextBlock[] {
		return this.blocks.filter((block) => block.isOpen);
	}

	/** The journal position this projection was built from. */
	public get coveredRevision(): SessionRevision {
		let covered = SessionRevision.initial();
		for (const block of this.blocks) {
			if (block.lastRevision.isAfter(covered)) covered = block.lastRevision;
		}
		return covered;
	}

	/**
	 * The blocks as one call, with images moved to where a provider can carry them.
	 * The projection itself is untouched: what a block holds is a fact of the session, and
	 * what a request holds is a fact about one provider's wire format.
	 */
	public toRequest(): ModelRequest {
		return new ModelRequest(new MediaSplitter().split(this.messages), this.tools, this.instructions());
	}

	/** Runtime instructions come before the agent prompt, and absence stays absence. */
	private instructions(): PromptInstructions | undefined {
		if (this.runtimeInstructions === undefined) return this.agentPrompt;
		if (this.agentPrompt === undefined) return this.runtimeInstructions;
		return this.runtimeInstructions.concat(this.agentPrompt);
	}
}

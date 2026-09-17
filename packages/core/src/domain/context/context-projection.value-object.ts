import { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { ModelMessage } from "../model/messages/model-message.value-object";
import type { ToolDeclaration } from "../model/messages/tool-declaration.value-object";
import { ModelRequest } from "../model/model-request.value-object";
import type { PromptInstructions } from "../prompt/prompt-instructions.value-object";
import type { ContextBlock } from "./context-block.value-object";
import { MediaSplitter } from "./media-splitter.service";

/**
 * What the model is about to read, as blocks instead of a flat list of messages.
 *
 * Immutable: every change answers a new projection, so a context already measured stays
 * comparable to the one that replaces it.
 */
export class ContextProjection {
	public readonly blocks: readonly ContextBlock[];
	public readonly tools: readonly ToolDeclaration[];

	public constructor(
		blocks: readonly ContextBlock[],
		tools: readonly ToolDeclaration[] = [],
		public readonly runtimeInstructions?: PromptInstructions,
		public readonly agentPrompt?: PromptInstructions,
		public readonly outputSchema?: object,
	) {
		this.blocks = [...blocks];
		this.tools = [...tools];
	}

	public withBlocks(blocks: readonly ContextBlock[]): ContextProjection {
		return new ContextProjection([...blocks], this.tools, this.runtimeInstructions, this.agentPrompt, this.outputSchema);
	}

	public get messages(): readonly ModelMessage[] {
		return this.blocks.flatMap((block) => block.messages);
	}

	public get openBlocks(): readonly ContextBlock[] {
		return this.blocks.filter((block) => block.isOpen);
	}

	public get coveredRevision(): SessionRevision {
		let covered = SessionRevision.initial();
		for (const block of this.blocks) {
			if (block.lastRevision.isAfter(covered)) covered = block.lastRevision;
		}
		return covered;
	}

	public toRequest(): ModelRequest {
		return new ModelRequest(new MediaSplitter().split(this.messages), this.tools, this.instructions(), this.outputSchema);
	}

	private instructions(): PromptInstructions | undefined {
		if (this.runtimeInstructions === undefined) return this.agentPrompt;
		if (this.agentPrompt === undefined) return this.runtimeInstructions;
		return this.runtimeInstructions.concat(this.agentPrompt);
	}
}

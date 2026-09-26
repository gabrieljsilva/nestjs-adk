import {
	type ContextBlock,
	ContextSummarizer,
	type LlmModel,
	ModelExecutor,
	ModelRequest,
	PromptInstructions,
	type RunContext,
	UserMessage,
} from "@nestjs-adk/core";

const INSTRUCTIONS = [
	"You summarize the beginning of a customer service conversation that needs to be shortened.",
	"Keep what the customer requested, every number mentioned (orders, amounts, plans), and what has already been decided.",
	"Write at most four sentences in English, without a greeting or an offer to help.",
].join(" ");

const SEPARATOR = "\n";

export class StoreSummarizer extends ContextSummarizer {
	public constructor(
		private readonly model: LlmModel,
		private readonly executor: ModelExecutor = new ModelExecutor(),
	) {
		super();
	}

	public async summarize(context: RunContext, blocks: readonly ContextBlock[]): Promise<string> {
		const conversation = this.transcriptOf(blocks);
		if (conversation.length === 0) return "";

		const response = await this.executor.execute(context, this.model, this.requestFor(conversation));
		return response.text.trim();
	}

	private requestFor(conversation: string): ModelRequest {
		return new ModelRequest(
			[new UserMessage(`Summarize this conversation:\n\n${conversation}`)],
			[],
			PromptInstructions.from(INSTRUCTIONS),
		);
	}

	private transcriptOf(blocks: readonly ContextBlock[]): string {
		const lines: string[] = [];
		for (const block of blocks) {
			for (const message of block.messages) {
				const text = message.text.trim();
				if (text.length > 0) lines.push(`${message.role}: ${text}`);
			}
		}
		return lines.join(SEPARATOR);
	}
}

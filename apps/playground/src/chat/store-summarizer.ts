import {
	type ContextBlock,
	ContextSummarizer,
	type LlmModel,
	ModelExecutor,
	ModelRequest,
	PromptInstructions,
	UserMessage,
} from "@nestjs-adk/core";

const INSTRUCTIONS = [
	"You summarize the beginning of a customer service conversation that needs to be shortened.",
	"Keep what the customer requested, every number mentioned (orders, amounts, plans), and what has already been decided.",
	"Write at most four sentences in English, without a greeting or an offer to help.",
].join(" ");

/** What a dropped turn looks like when it is handed to the model as text. */
const SEPARATOR = "\n";

/**
 * Turns the turns compaction is about to drop into a few sentences the model keeps.
 *
 * Without one, compaction simply forgets: the oldest exchanges leave and nothing marks
 * that they happened. With one, a customer who said their order number twenty turns ago
 * does not have to say it again, which is the difference between a conversation that was
 * shortened and one that was reset.
 *
 * It costs a call, and the call is the point: the alternative is a mechanical excerpt,
 * and a truncated tool result is not a memory of anything. A summarizer that fails never
 * fails the run, so the worst case here is the behaviour of having none.
 */
export class StoreSummarizer extends ContextSummarizer {
	public constructor(
		private readonly model: LlmModel,
		private readonly executor: ModelExecutor = new ModelExecutor(),
	) {
		super();
	}

	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		const conversation = this.transcriptOf(blocks);
		if (conversation.length === 0) return "";

		const response = await this.executor.execute(this.model, this.requestFor(conversation));
		return response.text.trim();
	}

	private requestFor(conversation: string): ModelRequest {
		return new ModelRequest(
			[new UserMessage(`Summarize this conversation:\n\n${conversation}`)],
			[],
			PromptInstructions.from(INSTRUCTIONS),
		);
	}

	/** Every message of every block, labelled by who said it, which is all a summary needs. */
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

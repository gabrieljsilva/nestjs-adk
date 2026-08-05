import { describe, expect, it } from "vitest";
import { SessionRevision } from "../common/revision/session-revision";
import { ContextBlock } from "../domain/context/context-block";
import { UserMessage } from "../domain/model/user-message";
import { ContextSummarizer } from "./context-summarizer";

class CountingSummarizer extends ContextSummarizer {
	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		return `${blocks.length} earlier exchanges`;
	}
}

describe("ContextSummarizer", () => {
	it("turns the blocks being dropped into one text", async () => {
		const dropped = [
			ContextBlock.conversation(new UserMessage("one"), SessionRevision.of(1)),
			ContextBlock.conversation(new UserMessage("two"), SessionRevision.of(2)),
		];

		expect(await new CountingSummarizer().summarize(dropped)).toBe("2 earlier exchanges");
	});

	it("is the type compaction depends on", () => {
		expect(new CountingSummarizer()).toBeInstanceOf(ContextSummarizer);
	});
});

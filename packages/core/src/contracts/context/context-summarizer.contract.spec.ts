import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { ContextBlock } from "../../domain/context/context-block.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ContextSummarizer } from "./context-summarizer.contract";

class CountingSummarizer extends ContextSummarizer {
	public async summarize(_context: RunContext, blocks: readonly ContextBlock[]): Promise<string> {
		return `${blocks.length} earlier exchanges`;
	}
}

const RUN = RunContextFixture.run();

describe("ContextSummarizer", () => {
	it("turns the blocks being dropped into one text", async () => {
		const dropped = [
			ContextBlock.conversation(new UserMessage("one"), SessionRevision.of(1)),
			ContextBlock.conversation(new UserMessage("two"), SessionRevision.of(2)),
		];

		expect(await new CountingSummarizer().summarize(RUN, dropped)).toBe("2 earlier exchanges");
	});

	it("is the type compaction depends on", () => {
		expect(new CountingSummarizer()).toBeInstanceOf(ContextSummarizer);
	});
});

import { describe, expect, it } from "vitest";
import { ContextSummarizer } from "../../contracts/context-summarizer";
import { CompactionDecision } from "../../domain/context/compaction-decision";
import type { ContextBlock } from "../../domain/context/context-block";
import { ContextCategory } from "../../domain/context/context-category";
import { ContextProjection } from "../../domain/context/context-projection";
import { JournalFixture } from "../../support/context/journal.fixture";
import { ContextMeasurer } from "./context-measurer";
import { ContextProjector } from "./context-projector";
import { OldestFirstCompactionStrategy } from "./oldest-first-compaction-strategy";

const measurer = new ContextMeasurer();

class FixedSummarizer extends ContextSummarizer {
	public seen = 0;

	public constructor(private readonly text: string) {
		super();
	}

	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		this.seen = blocks.length;
		return this.text;
	}
}

class FailingSummarizer extends ContextSummarizer {
	public async summarize(): Promise<string> {
		throw new Error("the summarizer is down");
	}
}

async function longConversation(turns: number): Promise<ContextProjection> {
	const journal = new JournalFixture();
	for (let turn = 0; turn < turns; turn += 1) {
		journal.user(`question ${turn} `.repeat(4));
		journal.assistant(`answer ${turn} `.repeat(4));
	}
	return ContextProjection.of(await new ContextProjector().project(journal.stream()));
}

function charactersOf(projection: ContextProjection): number {
	return measurer.measure(projection).characters;
}

describe("OldestFirstCompactionStrategy", () => {
	it("names and versions itself, which is what a checkpoint records", () => {
		const strategy = new OldestFirstCompactionStrategy(measurer);

		expect(strategy.name).toBe("oldest-first");
		expect(strategy.version).toBe(1);
	});

	it("drops the oldest blocks until the projection reaches the share it was asked for", async () => {
		const projection = await longConversation(10);
		const target = Math.floor(charactersOf(projection) * 0.3);

		const compacted = await new OldestFirstCompactionStrategy(measurer).compact(
			projection,
			CompactionDecision.keepShare(0.3, 2),
		);

		expect(charactersOf(compacted)).toBeLessThanOrEqual(target);
		expect(compacted.blocks.length).toBeLessThan(projection.blocks.length);
	});

	it("keeps the most recent blocks the decision asked to keep", async () => {
		const projection = await longConversation(10);

		const compacted = await new OldestFirstCompactionStrategy(measurer).compact(
			projection,
			CompactionDecision.keepShare(0.01, 3),
		);

		expect(compacted.blocks).toHaveLength(3);
		expect(compacted.blocks).toEqual(projection.blocks.slice(-3));
	});

	it("never separates a call from its result", async () => {
		const journal = new JournalFixture()
			.user("older ".repeat(20))
			.toolCall("c-1", "search", { q: "x".repeat(40) })
			.toolResult("c-1", "search", { hits: "y".repeat(40) })
			.assistant("recent");
		const projection = ContextProjection.of(await new ContextProjector().project(journal.stream()));

		const compacted = await new OldestFirstCompactionStrategy(measurer).compact(
			projection,
			CompactionDecision.keepShare(0.05, 1),
		);

		for (const block of compacted.blocks) {
			if (block.category.equals(ContextCategory.TOOL_RESULTS)) expect(block.messages).toHaveLength(2);
		}
	});

	it("keeps an open obligation even when the target demands more room", async () => {
		const journal = new JournalFixture().user("older ".repeat(20)).toolCall("c-1", "search", { q: "x".repeat(40) });
		const projection = ContextProjection.of(await new ContextProjector().project(journal.stream()));

		const compacted = await new OldestFirstCompactionStrategy(measurer).compact(
			projection,
			CompactionDecision.keepShare(0.01, 0),
		);

		expect(compacted.openBlocks).toHaveLength(1);
	});

	it("leaves the given projection untouched", async () => {
		const projection = await longConversation(10);
		const before = projection.blocks.length;

		await new OldestFirstCompactionStrategy(measurer).compact(projection, CompactionDecision.keepShare(0.3, 2));

		expect(projection.blocks).toHaveLength(before);
	});

	it("writes one summary over everything it dropped", async () => {
		const projection = await longConversation(10);
		const summarizer = new FixedSummarizer("earlier: the user asked ten questions");

		const compacted = await new OldestFirstCompactionStrategy(measurer, summarizer).compact(
			projection,
			CompactionDecision.keepShare(0.5, 2),
		);

		expect(compacted.blocks[0]?.category).toBe(ContextCategory.SUMMARIES);
		expect(compacted.blocks[0]?.messages[0]?.text).toContain("earlier");
		expect(summarizer.seen).toBeGreaterThan(0);
	});

	it("drops a summary that would not fit rather than overflowing the target", async () => {
		const projection = await longConversation(10);
		const target = Math.floor(charactersOf(projection) * 0.2);

		const compacted = await new OldestFirstCompactionStrategy(measurer, new FixedSummarizer("z".repeat(4000))).compact(
			projection,
			CompactionDecision.keepShare(0.2, 2),
		);

		expect(charactersOf(compacted)).toBeLessThanOrEqual(target);
		expect(compacted.blocks.some((block) => block.category.equals(ContextCategory.SUMMARIES))).toBe(false);
	});

	it("compacts anyway when the summarizer fails", async () => {
		const projection = await longConversation(10);

		const compacted = await new OldestFirstCompactionStrategy(measurer, new FailingSummarizer()).compact(
			projection,
			CompactionDecision.keepShare(0.3, 2),
		);

		expect(compacted.blocks.length).toBeLessThan(projection.blocks.length);
	});

	it("returns the projection as it is when it already fits", async () => {
		const projection = await longConversation(2);

		const compacted = await new OldestFirstCompactionStrategy(measurer).compact(
			projection,
			CompactionDecision.keepShare(1, 2),
		);

		expect(compacted.blocks).toEqual(projection.blocks);
	});
});

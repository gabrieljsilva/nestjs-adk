import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { ContextBlock } from "../../domain/context/context-block";
import { ContextCategory } from "../../domain/context/context-category";
import { ContextProjection } from "../../domain/context/context-projection";
import { AssistantMessage } from "../../domain/model/assistant-message";
import { MediaPart } from "../../domain/model/media-part";
import { ToolDeclaration } from "../../domain/model/tool-declaration";
import { UserMessage } from "../../domain/model/user-message";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { JournalFixture } from "../../support/context/journal.fixture";
import { ContextMeasurer } from "./context-measurer";
import { ContextProjector } from "./context-projector";

const measurer = new ContextMeasurer();
const R1 = SessionRevision.of(1);

describe("ContextMeasurer", () => {
	it("measures every filled category in characters", () => {
		const projection = ContextProjection.of(
			[ContextBlock.conversation(new UserMessage("a".repeat(40)), R1)],
			[],
			PromptInstructions.from("c".repeat(8)),
			PromptInstructions.from("d".repeat(12)),
		);

		const composition = measurer.measure(projection);

		expect(composition.charactersOf(ContextCategory.RUNTIME_INSTRUCTIONS)).toBe(8);
		expect(composition.charactersOf(ContextCategory.AGENT_PROMPT)).toBe(12);
		expect(composition.charactersOf(ContextCategory.CONVERSATION)).toBe(40);
		expect(composition.characters).toBe(60);
	});

	it("reports each category as a share of the prompt", () => {
		const projection = ContextProjection.of(
			[ContextBlock.conversation(new UserMessage("a".repeat(75)), R1)],
			[],
			PromptInstructions.from("b".repeat(25)),
		);

		const composition = measurer.measure(projection);

		expect(composition.shareOf(ContextCategory.CONVERSATION)).toBe(0.75);
		expect(composition.shareOf(ContextCategory.RUNTIME_INSTRUCTIONS)).toBe(0.25);
	});

	it("counts a tool by its name, its purpose and its schema", () => {
		const projection = ContextProjection.of([], [new ToolDeclaration("refund", "refunds an order", { type: "object" })]);

		expect(measurer.measure(projection).charactersOf(ContextCategory.TOOL_DESCRIPTIONS)).toBeGreaterThan(
			"refund".length + "refunds an order".length,
		);
	});

	it("does not measure a category nobody filled", () => {
		const composition = measurer.measure(ContextProjection.of([]));

		expect(composition.entries).toHaveLength(0);
		expect(composition.isEmpty).toBe(true);
	});

	it("separates tool results from the conversation", async () => {
		const journal = new JournalFixture()
			.user("find it")
			.toolCall("c-1", "search", { q: "x" })
			.toolResult("c-1", "search", { hits: 1 });
		const blocks = await new ContextProjector().project(journal.stream());

		const composition = measurer.measure(ContextProjection.of(blocks));

		expect(composition.shareOf(ContextCategory.CONVERSATION)).toBeGreaterThan(0);
		expect(composition.shareOf(ContextCategory.TOOL_RESULTS)).toBeGreaterThan(0);
	});

	// A megabyte of base64 counted literally would be the whole composition, and compaction
	// would start dropping conversation to make room for something billed as a few hundred tokens.
	it("counts an attached image as its projected cost, so one image cannot take over the context", () => {
		const image = MediaPart.image("image/png", "iVBORw0KGgoA".repeat(90_000));
		const withImage = ContextProjection.of([
			ContextBlock.conversation(new UserMessage("what is this?", [image]), R1),
			ContextBlock.conversation(new AssistantMessage("a picture of something".repeat(20)), R1),
		]);

		const composition = measurer.measure(withImage);

		expect(image.encodedBytes).toBeGreaterThan(1_000_000);
		expect(composition.characters).toBeLessThan(10_000);
	});

	it("measures the same projection to the same numbers twice", () => {
		const projection = ContextProjection.of([ContextBlock.conversation(new UserMessage("hi there"), R1)]);

		expect(measurer.measure(projection).characters).toBe(measurer.measure(projection).characters);
	});

	it("answers without a model, because no provider counts before a call", () => {
		expect(measurer.measure.length).toBe(1);
	});
});

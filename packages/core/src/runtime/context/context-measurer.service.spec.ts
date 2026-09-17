import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { ContextBlock } from "../../domain/context/context-block.value-object";
import { ContextProjection } from "../../domain/context/context-projection.value-object";
import { AssistantMessage } from "../../domain/model/messages/assistant-message.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import { JournalFixture } from "../../support/context/journal.fixture";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ContextMeasurer } from "./context-measurer.service";
import { ContextProjector } from "./context-projector.service";

const measurer = new ContextMeasurer();
const R1 = new SessionRevision(1);

const RUN = RunContextFixture.run();

describe("ContextMeasurer", () => {
	it("counts the instructions, the prompt and the conversation as one size", () => {
		const projection = new ContextProjection(
			[ContextBlock.conversation(new UserMessage("a".repeat(40)), R1)],
			[],
			PromptInstructions.from("c".repeat(8)),
			PromptInstructions.from("d".repeat(12)),
		);

		expect(measurer.measure(projection)).toBe(60);
	});

	it("counts a tool by its name, its purpose and its schema", () => {
		const projection = new ContextProjection([], [new ToolDeclaration("refund", "refunds an order", { type: "object" })]);

		expect(measurer.measure(projection)).toBeGreaterThan("refund".length + "refunds an order".length);
	});

	it("measures an empty projection as nothing", () => {
		expect(measurer.measure(new ContextProjection([]))).toBe(0);
	});

	it("counts a tool result like anything else that reaches the model", async () => {
		const journal = new JournalFixture()
			.user("find it")
			.toolCall("c-1", "search", { q: "x" })
			.toolResult("c-1", "search", { hits: 1 });
		const blocks = await new ContextProjector().project(RUN, journal.stream());

		const conversationOnly = measurer.measure(new ContextProjection(blocks.slice(0, 1)));

		expect(measurer.measure(new ContextProjection(blocks))).toBeGreaterThan(conversationOnly);
	});

	// A megabyte of base64 counted literally would be the whole prompt, and compaction would
	// start dropping conversation to make room for something billed as a few hundred tokens.
	it("counts an attached image as its projected cost, so one image cannot take over the context", () => {
		const image = MediaPart.image("image/png", "iVBORw0KGgoA".repeat(90_000));
		const withImage = new ContextProjection([
			ContextBlock.conversation(new UserMessage("what is this?", [image]), R1),
			ContextBlock.conversation(new AssistantMessage("a picture of something".repeat(20)), R1),
		]);

		expect(image.encodedBytes).toBeGreaterThan(1_000_000);
		expect(measurer.measure(withImage)).toBeLessThan(10_000);
	});

	it("measures the same projection to the same number twice", () => {
		const projection = new ContextProjection([ContextBlock.conversation(new UserMessage("hi there"), R1)]);

		expect(measurer.measure(projection)).toBe(measurer.measure(projection));
	});

	it("answers without a model, because no provider counts before a call", () => {
		expect(measurer.measure.length).toBe(1);
	});
});

import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AssistantMessage } from "../model/assistant-message";
import { ToolCallMessage } from "../model/tool-call-message";
import { ToolDeclaration } from "../model/tool-declaration";
import { UserMessage } from "../model/user-message";
import { PromptInstructions } from "../prompt/prompt-instructions";
import { ContextBlock } from "./context-block";
import { ContextProjection } from "./context-projection";

const R1 = SessionRevision.of(1);
const R2 = SessionRevision.of(2);
const R3 = SessionRevision.of(3);
const search = new ToolDeclaration("search", "finds things", {});

describe("ContextProjection", () => {
	it("flattens blocks into messages in block order", () => {
		const projection = ContextProjection.of([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.conversation(new AssistantMessage("hello"), R2),
		]);

		expect(projection.messages.map((message) => message.text)).toEqual(["hi", "hello"]);
	});

	it("covers the highest revision it holds", () => {
		const projection = ContextProjection.of([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.conversation(new AssistantMessage("hello"), R3),
		]);

		expect(projection.coveredRevision.value).toBe(3);
	});

	it("covers the initial revision when it holds nothing", () => {
		expect(ContextProjection.of([]).coveredRevision.value).toBe(0);
	});

	it("lists the blocks still waiting for a result", () => {
		const call = new ToolCallMessage(ToolCallId.from("c-1"), "search", {});
		const projection = ContextProjection.of([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.pendingCall(call, R2),
		]);

		expect(projection.openBlocks).toHaveLength(1);
	});

	it("builds a request carrying messages, tools and joined instructions", () => {
		const projection = ContextProjection.of(
			[ContextBlock.conversation(new UserMessage("hi"), R1)],
			[search],
			PromptInstructions.from("runtime"),
			PromptInstructions.from("agent"),
		);

		const request = projection.toRequest();

		expect(request.messages).toHaveLength(1);
		expect(request.tools).toEqual([search]);
		expect(request.instructions?.text).toBe("runtime\n\nagent");
	});

	it("keeps absent instructions absent", () => {
		expect(ContextProjection.of([]).toRequest().instructions).toBeUndefined();
	});

	it("replaces blocks by returning another projection, keeping tools and prompts", () => {
		const original = ContextProjection.of(
			[ContextBlock.conversation(new UserMessage("hi"), R1)],
			[search],
			undefined,
			PromptInstructions.from("agent"),
		);

		const compacted = original.withBlocks([]);

		expect(original.blocks).toHaveLength(1);
		expect(compacted.blocks).toHaveLength(0);
		expect(compacted.tools).toEqual([search]);
		expect(compacted.agentPrompt?.text).toBe("agent");
	});

	it("copies the blocks it is given, so a later push cannot reach inside", () => {
		const blocks = [ContextBlock.conversation(new UserMessage("hi"), R1)];
		const projection = ContextProjection.of(blocks);

		blocks.push(ContextBlock.conversation(new UserMessage("later"), R2));

		expect(projection.blocks).toHaveLength(1);
	});
});

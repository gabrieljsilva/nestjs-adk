import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AssistantMessage } from "../model/messages/assistant-message.value-object";
import { ToolCallMessage } from "../model/messages/tool-call-message.value-object";
import { ToolDeclaration } from "../model/messages/tool-declaration.value-object";
import { UserMessage } from "../model/messages/user-message.value-object";
import { PromptInstructions } from "../prompt/prompt-instructions.value-object";
import { ContextBlock } from "./context-block.value-object";
import { ContextProjection } from "./context-projection.value-object";

const R1 = new SessionRevision(1);
const R2 = new SessionRevision(2);
const R3 = new SessionRevision(3);
const search = new ToolDeclaration("search", "finds things", {});

describe("ContextProjection", () => {
	it("flattens blocks into messages in block order", () => {
		const projection = new ContextProjection([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.conversation(new AssistantMessage("hello"), R2),
		]);

		expect(projection.messages.map((message) => message.text)).toEqual(["hi", "hello"]);
	});

	it("covers the highest revision it holds", () => {
		const projection = new ContextProjection([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.conversation(new AssistantMessage("hello"), R3),
		]);

		expect(projection.coveredRevision.value).toBe(3);
	});

	it("covers the initial revision when it holds nothing", () => {
		expect(new ContextProjection([]).coveredRevision.value).toBe(0);
	});

	it("lists the blocks still waiting for a result", () => {
		const call = new ToolCallMessage(ToolCallId.from("c-1"), "search", {});
		const projection = new ContextProjection([
			ContextBlock.conversation(new UserMessage("hi"), R1),
			ContextBlock.pendingCall(call, R2),
		]);

		expect(projection.openBlocks).toHaveLength(1);
	});

	it("builds a request carrying messages, tools and joined instructions", () => {
		const projection = new ContextProjection(
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

	it("asks the model for the shape the agent declared, which is what makes a run answer data", () => {
		const schema = { type: "object", properties: { title: { type: "string" } } };

		const request = new ContextProjection([], [], undefined, undefined, schema).toRequest();

		expect(request.outputSchema).toBe(schema);
		expect(request.wantsStructuredOutput).toBe(true);
	});

	it("carries the shape through compaction, which builds another projection from this one", () => {
		const schema = { type: "object", properties: { title: { type: "string" } } };
		const original = new ContextProjection([], [], undefined, undefined, schema);

		const compacted = original.withBlocks([ContextBlock.conversation(new UserMessage("summary"), R1)]);

		expect(compacted.toRequest().outputSchema).toBe(schema);
	});

	it("asks for no shape when the agent declared none, which is what most agents do", () => {
		expect(new ContextProjection([]).toRequest().wantsStructuredOutput).toBe(false);
	});

	it("keeps absent instructions absent", () => {
		expect(new ContextProjection([]).toRequest().instructions).toBeUndefined();
	});

	it("replaces blocks by returning another projection, keeping tools and prompts", () => {
		const original = new ContextProjection(
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
		const projection = new ContextProjection(blocks);

		blocks.push(ContextBlock.conversation(new UserMessage("later"), R2));

		expect(projection.blocks).toHaveLength(1);
	});
});

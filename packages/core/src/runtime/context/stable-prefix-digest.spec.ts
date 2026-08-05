import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { ContextBlock } from "../../domain/context/context-block";
import { ContextProjection } from "../../domain/context/context-projection";
import { ToolDeclaration } from "../../domain/model/tool-declaration";
import { UserMessage } from "../../domain/model/user-message";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { StablePrefixDigest } from "./stable-prefix-digest";

const digest = new StablePrefixDigest();
const R1 = SessionRevision.of(1);
const search = new ToolDeclaration("search", "finds things", { type: "object" });

function projectionOf(messages: string[], tools = [search]): ContextProjection {
	return ContextProjection.of(
		messages.map((text) => ContextBlock.conversation(new UserMessage(text), R1)),
		tools,
		PromptInstructions.from("runtime"),
		PromptInstructions.from("agent"),
	);
}

describe("StablePrefixDigest", () => {
	it("is the same for the same prefix", () => {
		expect(digest.of(projectionOf(["hi"])).equals(digest.of(projectionOf(["hi"])))).toBe(true);
	});

	it("ignores the conversation, which is what compaction rewrites", () => {
		const before = digest.of(projectionOf(["hi", "there", "again"]));
		const after = digest.of(projectionOf(["again"]));

		expect(before.equals(after)).toBe(true);
	});

	it("changes when the agent prompt changes", () => {
		const other = ContextProjection.of([], [search], PromptInstructions.from("runtime"), PromptInstructions.from("new"));

		expect(digest.of(projectionOf([])).equals(digest.of(other))).toBe(false);
	});

	it("changes when the toolset changes", () => {
		const other = projectionOf([], [search, new ToolDeclaration("fetch", "reads a page", {})]);

		expect(digest.of(projectionOf([])).equals(digest.of(other))).toBe(false);
	});

	it("changes when a tool schema changes, even under the same name", () => {
		const other = projectionOf([], [new ToolDeclaration("search", "finds things", { type: "string" })]);

		expect(digest.of(projectionOf([])).equals(digest.of(other))).toBe(false);
	});

	it("does not depend on key order inside a tool schema", () => {
		const one = projectionOf([], [new ToolDeclaration("search", "finds things", { a: 1, b: 2 })]);
		const other = projectionOf([], [new ToolDeclaration("search", "finds things", { b: 2, a: 1 })]);

		expect(digest.of(one).equals(digest.of(other))).toBe(true);
	});

	it("carries the algorithm that produced it", () => {
		expect(digest.of(projectionOf([])).algorithm).toBe("sha256");
	});
});

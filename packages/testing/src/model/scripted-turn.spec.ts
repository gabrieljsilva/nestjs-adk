import { ModelRequest, UserMessage } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ScriptedTurn } from "./scripted-turn";

function request(text: string): ModelRequest {
	return new ModelRequest([new UserMessage(text)]);
}

describe("ScriptedTurn", () => {
	it("is words, or a request for a tool, and never both", () => {
		expect(ScriptedTurn.text("hello").call).toBeUndefined();
		expect(ScriptedTurn.toolCall("lookup_order", { id: "1" }).text).toBe("");
	});

	it("keeps the arguments the script asked the tool for", () => {
		expect(ScriptedTurn.toolCall("lookup_order", { id: "1" }).call?.args).toEqual({ id: "1" });
	});

	it("carries several calls in one turn, the way a model asks in parallel", () => {
		const turn = ScriptedTurn.toolCalls([
			{ tool: "find_order", args: { id: "1" } },
			{ tool: "refund_limit", args: { plan: "gold" } },
		]);

		expect(turn.calls.map((call) => call.tool)).toEqual(["find_order", "refund_limit"]);
		expect(turn.call?.tool).toBe("find_order");
	});

	it("accepts any request until a guard says otherwise", () => {
		expect(ScriptedTurn.text("hi").accepts(request("anything"))).toBe(true);
	});

	it("guards by mention, by pattern and by predicate", () => {
		expect(ScriptedTurn.text("hi").expecting("A-1042").accepts(request("where is A-1042?"))).toBe(true);
		expect(ScriptedTurn.text("hi").expecting("A-1042").accepts(request("hello"))).toBe(false);
		expect(ScriptedTurn.text("hi").expecting(/a-\d+/i).accepts(request("order A-7"))).toBe(true);
		expect(
			ScriptedTurn.text("hi")
				.expecting((seen) => seen.messages.length === 1)
				.accepts(request("x")),
		).toBe(true);
	});

	it("says what the guard demanded, in the words a deviation error shows", () => {
		expect(ScriptedTurn.text("hi").expecting("A-1042").expectationText).toContain("A-1042");
		expect(ScriptedTurn.text("hi").expectationText).toBe("anything");
	});

	it("keeps the pieces a streamed turn was written with, and the whole answer they make", () => {
		const turn = ScriptedTurn.stream(["Temos ", "dois."]);

		expect(turn.deltas).toEqual(["Temos ", "dois."]);
		expect(turn.text).toBe("Temos dois.");
	});

	it("counts a text turn as one piece, so a caller reads both kinds the same way", () => {
		expect(ScriptedTurn.text("Temos dois.").deltas).toEqual(["Temos dois."]);
	});

	it("carries no piece at all when the turn asks for a tool", () => {
		expect(ScriptedTurn.toolCall("find_order", { id: "1" }).deltas).toEqual([]);
	});

	it("keeps the pieces when the turn is guarded", () => {
		expect(ScriptedTurn.stream(["a", "b"]).expecting("x").deltas).toEqual(["a", "b"]);
	});
});

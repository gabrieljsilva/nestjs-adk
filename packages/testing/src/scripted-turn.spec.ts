import { describe, expect, it } from "vitest";
import { ScriptedTurn } from "./scripted-turn";

describe("ScriptedTurn", () => {
	it("is words, or a request for a tool, and never both", () => {
		expect(ScriptedTurn.text("hello").call).toBeUndefined();
		expect(ScriptedTurn.toolCall("lookup_order", { id: "1" }).text).toBe("");
	});

	it("keeps the arguments the script asked the tool for", () => {
		expect(ScriptedTurn.toolCall("lookup_order", { id: "1" }).call?.args).toEqual({ id: "1" });
	});
});

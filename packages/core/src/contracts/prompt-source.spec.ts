import { describe, expect, it } from "vitest";
import { PromptSource } from "./prompt-source";

class TablePrompts extends PromptSource {
	public constructor(private readonly rows: Record<string, string> = {}) {
		super();
	}

	public async load(name: string): Promise<string | undefined> {
		return this.rows[name];
	}
}

class DescribingPrompts extends TablePrompts {
	public override describe(name: string): string {
		return `prompts table, name = ${name}`;
	}
}

describe("PromptSource", () => {
	it("serves what it has by name", async () => {
		const source = new TablePrompts({ "support.md": "You are support." });

		expect(await source.load("support.md")).toBe("You are support.");
	});

	/** Absence is an answer here, and the caller decides whether it is a failure. */
	it("answers nothing for a name it does not have, without throwing", async () => {
		const source = new TablePrompts();

		expect(await source.load("missing.md")).toBeUndefined();
	});

	it("describes a lookup as the name itself until an implementation says otherwise", () => {
		expect(new TablePrompts().describe("support.md")).toBe("support.md");
	});

	it("lets an implementation say where it actually looked", () => {
		expect(new DescribingPrompts().describe("support.md")).toBe("prompts table, name = support.md");
	});
});

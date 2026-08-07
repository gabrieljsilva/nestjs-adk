import { describe, expect, it } from "vitest";
import { PromptSource } from "../../contracts/prompt-source";
import { MissingPromptVariablesError } from "../../domain/prompt/errors/missing-prompt-variables.error";
import { PromptNotFoundError } from "../../domain/prompt/errors/prompt-not-found.error";
import { AgentPrompting } from "./agent-prompting";

class MapPrompts extends PromptSource {
	public readonly asked: string[] = [];

	public constructor(private readonly rows: Record<string, string> = {}) {
		super();
	}

	public async load(name: string): Promise<string | undefined> {
		this.asked.push(name);
		return this.rows[name];
	}

	public override describe(name: string): string {
		return `map, key = ${name}`;
	}
}

function promptingOf(rows: Record<string, string> = {}) {
	const source = new MapPrompts(rows);
	return { source, prompting: new AgentPrompting(source) };
}

describe("AgentPrompting", () => {
	describe("render", () => {
		it("interpolates a template the agent already has, without any source involved", () => {
			const { prompting, source } = promptingOf();

			expect(prompting.render("Hello {{name}}.", { name: "Ana" })).toBe("Hello Ana.");
			expect(source.asked).toEqual([]);
		});

		it("renders a template with no variables when none are given", () => {
			const { prompting } = promptingOf();

			expect(prompting.render("You are support.")).toBe("You are support.");
		});

		it("fails on a required variable nobody filled, the same as the other two do", () => {
			const { prompting } = promptingOf();

			expect(() => prompting.render("Hello {{{name}}}.")).toThrow(MissingPromptVariablesError);
		});
	});

	describe("renderFromFile", () => {
		it("reads by name and interpolates what it read", async () => {
			const { prompting } = promptingOf({ "support.md": "You are support for {{store}}." });

			expect(await prompting.renderFromFile("support.md", { store: "Nébula" })).toBe("You are support for Nébula.");
		});

		it("serves a template with no variables in it", async () => {
			const { prompting } = promptingOf({ "support.md": "You are support." });

			expect(await prompting.renderFromFile("support.md")).toBe("You are support.");
		});

		it("answers nothing when the source has no prompt under that name", async () => {
			const { prompting } = promptingOf();

			expect(await prompting.renderFromFile("support.md")).toBeUndefined();
		});

		it("fails on a missing required variable even though the file was found", async () => {
			const { prompting } = promptingOf({ "support.md": "You are support for {{{store}}}." });

			await expect(prompting.renderFromFile("support.md")).rejects.toThrow(MissingPromptVariablesError);
		});

		it("names the file in that failure, so the message says which one to open", async () => {
			const { prompting } = promptingOf({ "support.md": "{{{store}}}" });

			await expect(prompting.renderFromFile("support.md")).rejects.toThrowError(/support\.md/);
		});
	});

	describe("renderFromFileOrFail", () => {
		it("answers the same text when the prompt is there", async () => {
			const { prompting } = promptingOf({ "support.md": "You are support for {{store}}." });

			expect(await prompting.renderFromFileOrFail("support.md", { store: "Nébula" })).toBe("You are support for Nébula.");
		});

		it("fails for a prompt the source does not have", async () => {
			const { prompting } = promptingOf();

			await expect(prompting.renderFromFileOrFail("support.md")).rejects.toBeInstanceOf(PromptNotFoundError);
		});

		/** Where the source looked is the fact that explains the absence, so it travels. */
		it("says where the source looked", async () => {
			const { prompting } = promptingOf();

			await expect(prompting.renderFromFileOrFail("support.md")).rejects.toThrowError(/map, key = support\.md/);
		});
	});
});

import { describe, expect, it } from "vitest";
import { MissingPromptVariablesError } from "./errors/missing-prompt-variables.error";
import { PromptTemplate } from "./prompt-template";

describe("PromptTemplate", () => {
	it("puts the value where the variable was", () => {
		const rendered = PromptTemplate.of("Hello {{name}}, welcome back.").render({ name: "Ana" });

		expect(rendered).toBe("Hello Ana, welcome back.");
	});

	it("leaves nothing behind for an optional variable nobody filled", () => {
		const rendered = PromptTemplate.of("Plan: {{plan}}.").render({});

		expect(rendered).toBe("Plan: .");
	});

	it("renders a template with no variables at all unchanged", () => {
		const text = "You are the sales department. Answer in two sentences.";

		expect(PromptTemplate.of(text).render()).toBe(text);
	});

	it("interpolates the same variable everywhere it appears", () => {
		const rendered = PromptTemplate.of("{{name}} asked. Answer {{name}} directly.").render({ name: "Ana" });

		expect(rendered).toBe("Ana asked. Answer Ana directly.");
	});

	it("renders a number, a boolean and a date as the text they print as", () => {
		const rendered = PromptTemplate.of("{{count}} {{active}} {{when}}").render({
			count: 3,
			active: false,
			when: "2026-08-07",
		});

		expect(rendered).toBe("3 false 2026-08-07");
	});

	/** A value that arrived as a null column is the same absence as a key nobody passed. */
	it("treats null as absent", () => {
		expect(PromptTemplate.of("Plan: {{plan}}.").render({ plan: null })).toBe("Plan: .");
	});

	it("keeps a placeholder that is not a variable, because a prompt may talk about braces", () => {
		const rendered = PromptTemplate.of("Answer with {{ name }} or {{}} literally.").render({ name: "Ana" });

		expect(rendered).toBe("Answer with {{ name }} or {{}} literally.");
	});

	describe("required variables", () => {
		it("fills a required variable exactly like an optional one", () => {
			const rendered = PromptTemplate.of("Hello {{{name}}}.").render({ name: "Ana" });

			expect(rendered).toBe("Hello Ana.");
		});

		/**
		 * The whole reason both forms are matched in one pass, with the required one first.
		 * Matching `{{name}}` inside `{{{name}}}` renders `{Ana}` and reports nothing missing,
		 * which is a required variable quietly degraded into an optional one.
		 */
		it("resolves both forms in the same text", () => {
			const rendered = PromptTemplate.of("{{{name}}} is on {{plan}}.").render({ name: "Ana", plan: "gold" });

			expect(rendered).toBe("Ana is on gold.");
		});

		it("fails rather than sending a sentence with a gap in it", () => {
			expect(() => PromptTemplate.of("Hello {{{name}}}.").render({})).toThrow(MissingPromptVariablesError);
		});

		it("names every missing variable at once, so one run is enough to fix them all", () => {
			const render = () => PromptTemplate.of("{{{name}}} on {{{plan}}} in {{{language}}}").render({ name: "Ana" });

			expect(render).toThrowError(/plan, language/);
		});

		it("names each missing variable once, however many times it appears", () => {
			try {
				PromptTemplate.of("{{{name}}} {{{name}}}").render({});
				expect.unreachable("a missing required variable has to throw");
			} catch (error) {
				expect((error as MissingPromptVariablesError).missing).toEqual(["name"]);
			}
		});

		it("names the template when it has a name, so the file to open is in the message", () => {
			const render = () => PromptTemplate.of("{{{name}}}", "support.md").render({});

			expect(render).toThrowError(/support\.md/);
		});

		it("fails for a null value, since a column nobody filled is not a value", () => {
			expect(() => PromptTemplate.of("{{{name}}}").render({ name: null })).toThrow(MissingPromptVariablesError);
		});

		/** Provided is provided. An empty name is the caller's data, not a missing argument. */
		it("accepts an empty string as filled", () => {
			expect(PromptTemplate.of("[{{{name}}}]").render({ name: "" })).toBe("[]");
		});

		it("reports what is missing before rendering anything, so no half prompt escapes", () => {
			const render = () => PromptTemplate.of("Hello {{name}}, plan {{{plan}}}.").render({ name: "Ana" });

			expect(render).toThrow(MissingPromptVariablesError);
		});
	});

	/** A template is reused across runs, so rendering it must not depend on the last render. */
	it("renders the same template twice the same way", () => {
		const template = PromptTemplate.of("{{{name}}} on {{plan}}");

		expect(template.render({ name: "Ana", plan: "gold" })).toBe("Ana on gold");
		expect(template.render({ name: "Bia", plan: "gold" })).toBe("Bia on gold");
	});
});

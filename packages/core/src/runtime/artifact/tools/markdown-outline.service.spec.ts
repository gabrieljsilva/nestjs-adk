import { describe, expect, it } from "vitest";
import { MarkdownOutline } from "./markdown-outline.service";

const DOCUMENT = [
	"# Report",
	"",
	"intro",
	"## Revenue",
	"up",
	"### Q3 ###",
	"```",
	"# not a heading",
	"```",
	"## Costs",
].join("\n");

describe("MarkdownOutline", () => {
	it("lists the headings with their level and the line they are on", () => {
		const outline = new MarkdownOutline().build(DOCUMENT);

		expect(outline.lines).toBe(10);
		expect(outline.headings).toEqual([
			{ level: 1, title: "Report", line: 1 },
			{ level: 2, title: "Revenue", line: 4 },
			{ level: 3, title: "Q3", line: 6 },
			{ level: 2, title: "Costs", line: 10 },
		]);
	});

	it("is markdown when there is at least one heading, and not otherwise", () => {
		const outline = new MarkdownOutline();

		expect(outline.isMarkdown(DOCUMENT)).toBe(true);
		expect(outline.isMarkdown("plain prose\nwith #hashtags in it")).toBe(false);
	});
});

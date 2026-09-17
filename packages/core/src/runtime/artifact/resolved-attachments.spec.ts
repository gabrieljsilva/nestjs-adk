import { describe, expect, it } from "vitest";
import { MediaPart } from "../../domain/model/messages/media-part";
import { ResolvedAttachments } from "./resolved-attachments";

const PIXEL = "iVBORw0KGgo=";

describe("ResolvedAttachments", () => {
	it("holds nothing when nothing resolved", () => {
		const resolved = ResolvedAttachments.none();

		expect(resolved.media).toEqual([]);
		expect(resolved.notes).toEqual([]);
	});

	it("appends every note after the text, so the message still reads as one", () => {
		const resolved = new ResolvedAttachments([], ["[attachment image/png: gone]", "[attachment image/webp: gone]"]);

		expect(resolved.appendTo("describe these")).toBe(
			"describe these\n\n[attachment image/png: gone]\n[attachment image/webp: gone]",
		);
	});

	it("leaves the text alone when nothing stood in", () => {
		const resolved = new ResolvedAttachments([MediaPart.image("image/png", PIXEL)], []);

		expect(resolved.appendTo("describe this")).toBe("describe this");
	});

	it("annotates a tool output under a key no tool writes", () => {
		const resolved = new ResolvedAttachments([], ["[attachment image/png: gone]"]);

		expect(resolved.annotate({ rows: 3 })).toEqual({ rows: 3, "[attachments]": "[attachment image/png: gone]" });
	});

	it("hands a tool output back untouched when there is nothing to say", () => {
		const output = { rows: 3 };

		expect(ResolvedAttachments.none().annotate(output)).toBe(output);
	});
});

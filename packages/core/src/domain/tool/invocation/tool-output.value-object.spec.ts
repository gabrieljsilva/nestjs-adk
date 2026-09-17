import { describe, expect, it } from "vitest";
import { MediaPart } from "../../model/messages/media-part.value-object";
import { ToolOutput } from "./tool-output.value-object";

const PIXEL = "iVBORw0KGgo=";

describe("ToolOutput", () => {
	it("carries data with nothing to look at", () => {
		const output = new ToolOutput({ status: "shipped" });

		expect(output.data).toEqual({ status: "shipped" });
		expect(output.hasMedia).toBe(false);
	});

	it("carries data and the images that go with it", () => {
		const output = new ToolOutput({ chart: "sales" }, [MediaPart.image("image/png", PIXEL)]);

		expect(output.hasMedia).toBe(true);
		expect(output.media[0]?.base64).toBe(PIXEL);
	});

	it("copies the list, so a tool cannot add to it after answering", () => {
		const media = [MediaPart.image("image/png", PIXEL)];
		const output = new ToolOutput({}, media);

		media.push(MediaPart.image("image/png", PIXEL));

		expect(output.media).toHaveLength(1);
	});
});

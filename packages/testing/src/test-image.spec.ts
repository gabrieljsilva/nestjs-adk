import { describe, expect, it } from "vitest";
import { TestImage } from "./test-image";

const PNG_SIGNATURE = "iVBORw0KGgo";

describe("TestImage", () => {
	it("builds a real PNG, signature and all", () => {
		expect(TestImage.red().toBase64().startsWith(PNG_SIGNATURE)).toBe(true);
	});

	it("declares what it is", () => {
		expect(TestImage.red().mediaType).toBe("image/png");
	});

	it("writes the size and the colour type into the header", () => {
		const png = Buffer.from(TestImage.red().toBase64(), "base64");

		expect(png.readUInt32BE(16)).toBe(64);
		expect(png.readUInt32BE(20)).toBe(64);
		expect(png[24]).toBe(8);
		expect(png[25]).toBe(2);
	});

	it("gives the same bytes for the same colour, so a test is reproducible", () => {
		expect(TestImage.solid(1, 2, 3).toBase64()).toBe(TestImage.solid(1, 2, 3).toBase64());
	});

	it("gives different bytes for different colours", () => {
		expect(TestImage.solid(255, 0, 0).toBase64()).not.toBe(TestImage.solid(0, 0, 255).toBase64());
	});

	it("stays small enough to send without thinking about it", () => {
		expect(TestImage.red().toBase64().length).toBeLessThan(1000);
	});
});

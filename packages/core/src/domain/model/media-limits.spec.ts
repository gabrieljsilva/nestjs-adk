import { describe, expect, it } from "vitest";
import { MediaLimits } from "./media-limits";

const MEBIBYTE = 1024 * 1024;

describe("MediaLimits", () => {
	it("defaults to the ceilings the providers themselves enforce", () => {
		const limits = MediaLimits.byDefault();

		expect(limits.maxEncodedBytes).toBe(5 * MEBIBYTE);
		expect(limits.maxDecodedBytes).toBe(6 * MEBIBYTE);
		expect(limits.maxTotalEncodedBytes).toBe(8 * MEBIBYTE);
	});

	it("accepts the image formats every provider here takes", () => {
		const limits = MediaLimits.byDefault();

		expect(limits.supports("image/png")).toBe(true);
		expect(limits.supports("image/jpeg")).toBe(true);
		expect(limits.supports("image/gif")).toBe(true);
		expect(limits.supports("image/webp")).toBe(true);
	});

	it("refuses anything else, including formats a browser will happily produce", () => {
		expect(MediaLimits.byDefault().supports("image/tiff")).toBe(false);
		expect(MediaLimits.byDefault().supports("application/pdf")).toBe(false);
	});

	it("can be tightened, which is what a test needs to reach a ceiling cheaply", () => {
		const limits = MediaLimits.of(8, 6, 12, ["image/png"]);

		expect(limits.maxEncodedBytes).toBe(8);
		expect(limits.supports("image/jpeg")).toBe(false);
	});

	it("copies the supported list, so a caller cannot widen it afterwards", () => {
		const supported = ["image/png"];
		const limits = MediaLimits.of(8, 6, 12, supported);

		supported.push("image/tiff");

		expect(limits.supports("image/tiff")).toBe(false);
	});
});

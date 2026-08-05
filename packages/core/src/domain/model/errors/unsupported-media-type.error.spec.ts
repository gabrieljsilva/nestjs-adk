import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { UnsupportedMediaTypeError } from "./unsupported-media-type.error";

describe("UnsupportedMediaTypeError", () => {
	it("carries a stable code", () => {
		expect(new UnsupportedMediaTypeError("image/tiff", ["image/png"]).code).toBe("MEDIA_UNSUPPORTED_TYPE");
	});

	it("names the type it refused and the ones it would take", () => {
		const error = new UnsupportedMediaTypeError("image/tiff", ["image/png", "image/jpeg"]);

		expect(error.message).toContain("image/tiff");
		expect(error.message).toContain("image/jpeg");
	});

	it("is an adk error", () => {
		expect(new UnsupportedMediaTypeError("image/tiff", [])).toBeInstanceOf(AdkError);
	});
});

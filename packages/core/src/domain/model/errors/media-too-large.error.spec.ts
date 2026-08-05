import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { MediaTooLargeError } from "./media-too-large.error";

describe("MediaTooLargeError", () => {
	it("carries a stable code", () => {
		expect(new MediaTooLargeError("encoded", 10, 5).code).toBe("MEDIA_TOO_LARGE");
	});

	it("names which of the three ceilings was crossed", () => {
		const error = new MediaTooLargeError("total", 10, 5);

		expect(error.measure).toBe("total");
		expect(error.message).toContain("total");
		expect(error.message).toContain("10");
		expect(error.message).toContain("5");
	});

	it("is an adk error", () => {
		expect(new MediaTooLargeError("decoded", 10, 5)).toBeInstanceOf(AdkError);
	});
});

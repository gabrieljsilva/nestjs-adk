import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { MalformedMediaError } from "./malformed-media.error";

describe("MalformedMediaError", () => {
	it("carries a stable code", () => {
		expect(new MalformedMediaError("not canonical base64").code).toBe("MEDIA_MALFORMED");
	});

	it("keeps the reason readable, because the three causes are not the same bug", () => {
		const error = new MalformedMediaError("not canonical base64");

		expect(error.reason).toBe("not canonical base64");
		expect(error.message).toContain("not canonical base64");
	});

	it("is an adk error", () => {
		expect(new MalformedMediaError("whatever")).toBeInstanceOf(AdkError);
	});
});

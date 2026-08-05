import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { UnsupportedCapabilityError } from "./unsupported-capability.error";

describe("UnsupportedCapabilityError", () => {
	it("carries a stable code", () => {
		expect(new UnsupportedCapabilityError("acme/m-1", "tools").code).toBe("MODEL_UNSUPPORTED_CAPABILITY");
	});

	it("names the model and the capability it lacks", () => {
		const error = new UnsupportedCapabilityError("acme/m-1", "tools");

		expect(error.message).toContain("acme/m-1");
		expect(error.message).toContain("tools");
	});

	it("is an adk error", () => {
		expect(new UnsupportedCapabilityError("acme/m-1", "tools")).toBeInstanceOf(AdkError);
	});
});
